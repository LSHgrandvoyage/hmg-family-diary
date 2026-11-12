import { connect } from "node:tls";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { X509Certificate, createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
loadEnvFile(".env.runtime");
const fixture = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const qa = { origin: process.env.APP_ORIGIN! };
const evidencePrefix = process.env.UI_EVIDENCE_PREFIX ?? "exact";
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
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
let uploadedPhotoId: string | undefined;
try {
  page.setDefaultTimeout(12000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(qa.origin + "/login");
  await page.getByLabel("이메일", { exact: true }).fill(fixture.email);
  await page.getByLabel(/^비밀번호/).fill(fixture.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/faithful/app.html#main");
  await expect(
    page.getByRole("button", { name: "검색", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "가족", exact: true }),
  ).toBeVisible();
  await page.goto(qa.origin + "/library/" + fixture.id);
  await page.waitForURL("**/faithful/app.html#detail?*");
  await expect(
    page.getByRole("button", { name: "편집", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "일기 읽기", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("기록했던 우리 차", { exact: true })).toHaveCount(
    0,
  );
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 추가", exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(18 * 1024 * 1024),
  });
  await expect(page.getByRole("dialog")).toContainText("10MB");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 추가", exact: true }).click();
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith("/photos") && r.request().method() === "POST",
  );
  await (await chooser).setFiles(".tools/runtime/qa-photo.png");
  const uploadResponse = await uploaded;
  expect(uploadResponse.ok()).toBe(true);
  uploadedPhotoId = uploadResponse.request().headers()["idempotency-key"];
  await page.waitForResponse(
    (r) =>
      r.url().endsWith("/sessions/" + fixture.id) &&
      r.request().method() === "GET",
  );
  await expect(
    page.getByRole("button", { name: "사진 1 크게 보기" }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/evidence/connected-ui/${evidencePrefix}-live-detail.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "일시정지", exact: true }),
  ).toBeVisible();
  // C017: mobile waveform advances with original audio, seeking and pause.
  await expect(page.locator("[data-wave-bar]")).toHaveCount(32);
  await page
    .getByRole("slider", { name: "녹음 재생 위치" })
    .evaluate((el: HTMLInputElement) => {
      el.value = String(Number(el.max) / 2);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await expect
    .poll(() => page.locator('[data-wave-bar][data-played="1.000"]').count())
    .toBeGreaterThanOrEqual(16);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const paused = await page
    .getByRole("slider", { name: "녹음 재생 위치" })
    .inputValue();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(
    await page.getByRole("slider", { name: "녹음 재생 위치" }).inputValue(),
  ).toBe(paused);
  await page.screenshot({
    path: `docs/evidence/connected-ui/${evidencePrefix}-playback.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "원문 전체 보기", exact: true }).click();
  await expect(page.getByText("녹음 원문", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "재생", exact: true }).click();
  const slider = page.getByRole("slider", { name: "녹음 재생 위치" });
  await slider.click();
  expect(Number(await slider.inputValue())).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "일시정지", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/evidence/connected-ui/${evidencePrefix}-live-transcript.png`,
  });
  await page.getByRole("link", { name: "일기로 돌아가기" }).click();
  await page.getByRole("button", { name: "공유", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "원본 녹음 내려받기", exact: true })
      .click(),
  ]);
  expect(
    createHash("sha256")
      .update(await readFile((await download.path())!))
      .digest("hex"),
  ).toBe(fixture.snapshot.sha256);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "편집", exact: true }).click();
  await page
    .getByRole("button", { name: "일기와 원본 삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto(qa.origin + "/devices");
  await expect(
    page.getByRole("button", { name: "차량 연결 코드 만들기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "차량 연결 코드 만들기" }).click();
  await expect(page.getByLabel(/^차량 연결 코드 /)).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "PASS exact DOM with real server synthetic login/list/detail/upload validation/upload/audio/seek/SHA download/delete cancel/pairing; no old UI inserted.",
  );
} catch (error) {
  console.error(
    "Visible dialog:",
    await page.locator("dialog").allTextContents(),
  );
  throw error;
} finally {
  if (uploadedPhotoId)
    await page.evaluate(
      async ({ id, photoId }) => {
        await fetch(`/api/v1/sessions/${id}/photos/${photoId}`, {
          method: "DELETE",
        });
      },
      { id: fixture.id, photoId: uploadedPhotoId },
    );
  await browser.close();
}
