import { connect } from "node:tls";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { X509Certificate, createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
loadEnvFile(".env.runtime");
const fixture = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const qa = { origin: process.env.APP_ORIGIN! };
const url = new URL(qa.origin);
const leaf = await new Promise<Buffer>((resolve, reject) => {
  // Verify the known CA with Node before allowing this exact leaf SPKI in the isolated browser.
  void readFile(".tools/runtime/local-ca.crt")
    .then((ca) => {
      const verified = connect(
        {
          host: url.hostname,
          port: Number(url.port),
          ca,
          rejectUnauthorized: true,
        },
        () => {
          const raw = verified.getPeerCertificate().raw;
          verified.end();
          resolve(raw);
        },
      );
      verified.on("error", reject);
    })
    .catch(reject);
});
const certificate = new X509Certificate(leaf);
const pin = createHash("sha256")
  .update(certificate.publicKey.export({ type: "spki", format: "der" }))
  .digest("base64");
// Trust only this local CA in the test browser. No product trust bypass or global ignoreHTTPSErrors.
// Launch a separate temporary profile; never attach to the user's Chrome session.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [`--ignore-certificate-errors-spki-list=${pin}`],
});
await mkdir("docs/evidence/connected-ui", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const png = await readFile(".tools/runtime/qa-photo.png");
  const wav = await readFile(".tools/runtime/qa.wav");
  const stories = [
    [
      "강릉 가는 길, 우리 가족의 바다 계획",
      "2026-11-07T04:00:00Z",
      "휴게소 간식을 고르며 오래 웃었다. 바다에 도착하면 조개껍데기를 열 개 줍고, 예쁜 것은 할머니께 드리기로 했다.",
    ],
    [
      "하원길 끝말잇기 대결",
      "2026-11-03T04:00:00Z",
      "기러기로 끝말잇기를 시작했다. 집에 도착할 때까지 새로운 말을 찾으며 웃었다.",
    ],
    [
      "할머니 댁 가는 길",
      "2026-10-25T04:00:00Z",
      "할머니께 불러 드릴 노래를 차 안에서 세 번이나 연습했다.",
    ],
  ];
  const records = stories.map(([label, recorded_at, text], i) => {
    const draft = JSON.parse(fixture.snapshot.draft);
    draft.groups[0].label = label;
    draft.groups[0].statements[0].text = text;
    return {
      id: "synthetic-design-" + i,
      revision: 1,
      snapshot: {
        ...fixture.snapshot,
        recorded_at,
        text,
        speaker: "합성 가족",
        draft: JSON.stringify(draft),
      },
      audio_ready: true,
      photos: i === 1 ? [] : [{ id: "p1" }, { id: "p2" }],
    };
  });
  let device = {
    id: "synthetic-device",
    label: "우리 집 차",
    expires_at: "2099-01-01T00:00:00Z",
    revoked_at: null,
  };
  let renamed = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/audio"))
      return route.fulfill({ contentType: "audio/wav", body: wav });
    if (path.includes("/photos/"))
      return route.fulfill({ contentType: "image/png", body: png });
    if (path.endsWith("/devices"))
      return route.fulfill({ json: { devices: [device] } });
    if (path.endsWith("/devices/synthetic-device")) {
      device = { ...device, label: route.request().postDataJSON().label };
      renamed = true;
      return route.fulfill({ json: device });
    }
    if (path.endsWith("/sessions"))
      return route.fulfill({ json: { items: records } });
    return route.fulfill({
      json: records.find((r) => path.endsWith(r.id)) ?? records[0],
    });
  });
  await page.goto(qa.origin + "/library");
  await expect(page.locator(".chagok-story")).toHaveCount(3);
  await expect(page.locator(".chagok-month")).toHaveCount(2);
  await page.screenshot({
    path: "docs/evidence/connected-ui/chagok-library.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "이야기 검색", exact: true }).click();
  await page
    .getByRole("textbox", { name: "이야기와 차량 검색" })
    .fill("끝말잇기");
  await expect(page.locator(".chagok-story")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "이야기와 차량 검색" })
    .fill("없는검색");
  await expect(page.getByText("찾는 이야기가 없어요")).toBeVisible();
  await page.goto(qa.origin + "/library/" + records[0].id);
  await expect(page.locator(".chagok-diary-card")).toBeVisible();
  for (const width of [375, 390, 812, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/evidence/connected-ui/chagok-detail-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "원문 전체 보기", exact: true })
    .click();
  await expect(page.locator("audio")).toHaveJSProperty("duration", 2);
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  await page.getByRole("slider", { name: "전체 녹음 재생 위치" }).fill("1");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThanOrEqual(1);
  await page.screenshot({
    path: "docs/evidence/connected-ui/chagok-listening.png",
  });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto(qa.origin + "/devices");
  await expect(
    page.getByRole("heading", { name: "우리 집 차", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/connected-ui/chagok-devices.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "차량 연결 코드 만들기" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
  console.log(
    "PASS Chagok monthly list/search, responsive 375/390/812/1440, original playback/seek, existing vehicle state; synthetic records/mocked API.",
  );
} finally {
  await browser.close();
}
