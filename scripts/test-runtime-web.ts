import { connect } from "node:tls";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { X509Certificate, createHash } from "node:crypto";
import { qa, qaRequest } from "./runtime-qa-client.ts";
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
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  page.on("response", (r) => {
    if (r.url().includes("/api/auth/") && r.status() >= 400)
      console.log("AUTH_TEST_STATUS", r.status());
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${qa.origin}/login`);
  await expect(
    page.getByRole("heading", { name: "우리 보관함 열기" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-login.png",
    fullPage: true,
  });
  await page.getByLabel("이메일", { exact: true }).fill(qa.email);
  await page.getByLabel(/^비밀번호/).fill(qa.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/library").catch(async (error) => {
    console.log("LOGIN_NOTICE", await page.getByRole("status").innerText());
    throw error;
  });
  await expect(page.getByRole("link", { name: /시험 화자/ })).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-library.png",
    fullPage: true,
  });
  await page.goto(`${qa.origin}/library/${qa.id}`);
  await expect(
    page.getByRole("heading", { name: "시험 화자의 이야기" }).first(),
  ).toBeVisible();
  const beforePhotos = await page.locator(".photo-open").count();
  await page
    .getByLabel("사진 첨부")
    .setInputFiles(".tools/runtime/qa-photo.png");
  await expect(page.getByRole("status")).toContainText("사진을 저장했어요");
  await expect(
    page.getByRole("button", { name: `사진 ${beforePhotos + 1} 크게 보기` }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-diary.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /그날의 목소리 듣기/ }).click();
  await expect(page.locator("audio")).toHaveJSProperty("duration", 2);
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect(page.locator("audio")).toHaveJSProperty("paused", false);
  await page.getByRole("button", { name: "일시 정지", exact: true }).click();
  await page.getByRole("slider", { name: "전체 녹음 재생 위치" }).fill("1");
  await expect(page.locator("audio")).toHaveJSProperty("currentTime", 1);
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-original.png",
    fullPage: true,
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "원본 녹음 내려받기" }).click(),
  ]);
  const saved = await readFile((await download.path())!);
  expect(createHash("sha256").update(saved).digest("hex")).toBe(
    qa.snapshot.sha256,
  );
  await page.getByRole("button", { name: "재생 종료" }).click();
  await page.goto(`${qa.origin}/devices`);
  await page.getByRole("button", { name: "차량 연결 코드 만들기" }).click();
  await expect(page.locator(".pair-code strong")).toHaveText(/^\d{8}$/);
  // Code is a short-lived capability: do not include it in a committed screenshot.
  await page.locator(".pair-code").evaluate((el) => el.remove());
  const issued = await qaRequest("/api/v1/pairings", "POST", {});
  const linked = await qaRequest("/api/v1/devices/claim", "POST", {
    code: issued.code,
    label: "웹 별칭 시험 차량",
  });
  try {
    await page.reload();
    await page
      .getByLabel("연결 기기 별칭", { exact: true })
      .fill("우리집 시험 아이오닉");
    await page.getByRole("button", { name: "별칭 저장", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "우리집 시험 아이오닉", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("연결 기기 별칭", { exact: true }),
    ).toHaveValue("우리집 시험 아이오닉");
    await page.getByLabel("연결 기기 별칭", { exact: true }).fill("   ");
    await expect(
      page.getByRole("button", { name: "별칭 저장", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("연결 기기 별칭", { exact: true })
      .fill("우리집 시험 아이오닉");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/evidence/connected-ui/phone-device-alias.png",
      fullPage: true,
    });
  } finally {
    await qaRequest(`/api/v1/devices/${linked.id}`, "DELETE");
  }
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-devices.png",
    fullPage: true,
  });
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${qa.origin}/library/${qa.id}`);
    await expect(
      page.getByRole("button", { name: /그날의 목소리 듣기/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  for (const img of await page.locator(".photo-open img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty("complete", true);
    await expect(img).toHaveCSS("object-fit", "contain");
    expect(
      await img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "docs/evidence/connected-ui/desktop-diary.png",
    fullPage: true,
  });
  await page.goto(`${qa.origin}/library`);
  await page.getByRole("button", { name: "계정", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.waitForURL("**/login");
  expect(errors).toEqual([]);
  console.log(
    "PASS browser verified login, phone photo upload, original playback/seek/download SHA, pairing, logout; 375/812/1024/1440 layouts, reduced motion; no page errors.",
  );
} finally {
  await browser.close();
}
