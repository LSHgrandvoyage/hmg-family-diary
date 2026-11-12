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
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const record = {
    id: fixture.id,
    revision: 1,
    snapshot: fixture.snapshot,
    audio_ready: true,
    photos: [],
    deleted: false,
  };
  let uploads = 0,
    rejectUpload = false;
  await page.route("**/api/v1/**", async (route) => {
    if (route.request().method() === "POST") {
      uploads++;
      if (rejectUpload)
        return route.fulfill({
          status: 422,
          json: { error: { code: "INVALID_PHOTO" } },
        });
    }
    await route.fulfill({ json: record });
  });
  await page.goto(`${qa.origin}/library/${record.id}`);
  const input = page.getByLabel("사진 첨부", { exact: true });
  await expect(input).toBeEnabled();
  await expect(
    page.getByText("JPEG로 변환해 주세요.", { exact: false }),
  ).toHaveCount(0);
  const popup = page.getByRole("dialog", { name: "사진을 추가하지 못했어요" });
  const oversized = {
    name: "synthetic-18mb.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(18 * 1024 * 1024),
  };
  for (let i = 0; i < 2; i++) {
    await input.setInputFiles(oversized);
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("18.0MB");
    await expect(popup).toContainText("10MB");
    expect(uploads).toBe(0);
    if (i === 0)
      await page.screenshot({
        path: "docs/evidence/connected-ui/photo-size-alert.png",
      });
    await popup.getByRole("button", { name: "확인", exact: true }).click();
    await expect(popup).toHaveCount(0);
  }
  await input.setInputFiles({
    name: "disguised.png",
    mimeType: "image/png",
    buffer: Buffer.from("unsupported HEIC or non-image content"),
  });
  await expect(popup).toContainText("지원하지 않는 사진 형식");
  expect(uploads).toBe(0);
  await page.screenshot({
    path: "docs/evidence/connected-ui/photo-format-alert.png",
  });
  await popup.getByRole("button", { name: "확인", exact: true }).click();
  const png = await readFile(".tools/runtime/qa-photo.png");
  rejectUpload = true;
  await input.setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(popup).toBeVisible();
  expect(uploads).toBe(1);
  await popup.getByRole("button", { name: "확인", exact: true }).click();
  rejectUpload = false;
  await input.setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByRole("status")).toContainText("사진을 저장했어요");
  expect(uploads).toBe(2);
  await expect(popup).toHaveCount(0);
  await page.goto(`${qa.origin}/demo/sea`);
  const preview = page.getByLabel("일기에 사진 추가", { exact: true });
  await expect(preview).toBeEnabled();
  await preview.setInputFiles(oversized);
  await expect(popup).toContainText("18.0MB");
  await popup.getByRole("button", { name: "확인", exact: true }).click();
  expect(errors).toEqual([]);
  console.log(
    "PASS mobile photo alerts: 18MB and repeat selection blocked before POST, disguised format blocked, server rejection shown, valid retry recovers, preview alert; mocked API with synthetic files only.",
  );
} finally {
  await browser.close();
}
