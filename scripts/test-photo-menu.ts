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
  const png = await readFile(".tools/runtime/qa-photo.png");
  const record = {
    id: fixture.id,
    snapshot: fixture.snapshot,
    audio_ready: true,
    revision: 1,
    photos: Array.from({ length: 5 }, (_, i) => ({
      id: `synthetic-${i}`,
      bytes: png.length,
      sha256: "synthetic",
    })),
  };
  let deletes = 0,
    rejectDelete = true;
  await page.route("**/api/v1/**", async (route) => {
    if (route.request().method() === "DELETE") {
      deletes++;
      if (rejectDelete)
        return route.fulfill({
          status: 500,
          json: { error: { code: "TEST_FAILURE" } },
        });
      const id = route.request().url().split("/").at(-1);
      record.photos = record.photos.filter((p) => p.id !== id);
    } else if (route.request().url().includes("/photos/"))
      return route.fulfill({ contentType: "image/png", body: png });
    await route.fulfill({ json: record });
  });
  await page.goto(`${qa.origin}/library/${record.id}`);
  await expect(
    page.locator(".photo-section > .photo-grid .photo-open"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "사진 삭제", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".reading-tabs")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.getByRole("button", { name: "사진 더보기 · 전체 5장" }).click();
  const all = page.getByRole("dialog", { name: "그날의 사진", exact: true });
  await expect(all.locator(".photo-open")).toHaveCount(5);
  await all.getByRole("button", { name: "사진 5 크게 보기" }).click();
  await expect(all.getByAltText("선택한 일기 사진")).toBeVisible();
  await expect(
    all.getByRole("button", { name: "사진 삭제", exact: true }),
  ).toHaveCount(0);
  await all.getByRole("button", { name: "닫기", exact: true }).click();
  const options = page.getByRole("button", { name: "사진 옵션", exact: true });
  await options.click();
  await expect(options).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await expect(options).toHaveAttribute("aria-expanded", "false");
  await options.click();
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-photo-menu.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "사진 삭제", exact: true }).click();
  const choose = page.getByRole("dialog", {
    name: "삭제할 사진 선택",
    exact: true,
  });
  await expect(choose.locator(".photo-open")).toHaveCount(5);
  await choose.getByRole("button", { name: "사진 5 삭제 선택" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "이 사진을 삭제할까요?",
    exact: true,
  });
  await confirmation.getByRole("button", { name: "취소", exact: true }).click();
  expect(deletes).toBe(0);
  await choose.getByRole("button", { name: "사진 5 삭제 선택" }).click();
  await confirmation.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(confirmation.getByRole("alert")).toBeVisible();
  expect(record.photos).toHaveLength(5);
  rejectDelete = false;
  await confirmation.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.locator(".photo-section > .photo-grid .photo-open"),
  ).toHaveCount(4);
  await expect(page.getByRole("button", { name: /사진 더보기/ })).toHaveCount(
    0,
  );
  for (const width of [375, 812, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${qa.origin}/demo/sea`);
  const input = page.getByLabel("일기에 사진 추가");
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".photo-open")).toHaveCount(1);
  await page.getByRole("button", { name: "사진 옵션" }).click();
  await page.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await page.getByRole("button", { name: "사진 1 삭제 선택" }).click();
  await page
    .getByRole("dialog", { name: "이 사진을 삭제할까요?" })
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.locator(".photo-open")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "PASS synthetic photo menu: 4-of-5 preview, all/zoom, menu Escape, delete choose/cancel/failure/retry, hide more at 4, transparent reading tabs, responsive widths and preview local deletion. API mocked.",
  );
} finally {
  await browser.close();
}
