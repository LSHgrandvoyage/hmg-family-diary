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
  const png = await readFile(".tools/runtime/qa-photo.png"),
    wav = await readFile(".tools/runtime/qa.wav");
  const record = {
    id: fixture.id,
    snapshot: fixture.snapshot,
    audio_ready: true,
    revision: 1,
    photos: [] as { id: string }[],
  };
  let deletes = 0;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/audio"))
      return route.fulfill({
        contentType: "audio/wav",
        headers: {
          "content-disposition": "attachment; filename=family-memory.wav",
        },
        body: wav,
      });
    if (path.includes("/photos/"))
      return route.fulfill({ contentType: "image/png", body: png });
    if (req.method() === "POST" && path.endsWith("/photos"))
      record.photos.push({ id: "synthetic-photo" });
    if (req.method() === "DELETE") {
      deletes++;
      return route.fulfill({ json: { deleted: true } });
    }
    if (path.endsWith("/sessions"))
      return route.fulfill({ json: { items: [] } });
    await route.fulfill({ json: record });
  });
  await page.goto(`${qa.origin}/library/${record.id}`);
  const photoMenu = page.getByRole("button", {
    name: "사진 옵션",
    exact: true,
  });
  await expect(photoMenu).toBeEnabled();
  expect(
    await photoMenu
      .locator("circle")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("cy"))),
  ).toEqual(["12", "12", "12"]);
  await expect(
    page.getByRole("button", { name: "사진 추가하기", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "사진 추가", exact: true }),
  ).toHaveCount(0);
  await photoMenu.click();
  await expect(
    page.getByRole("button", { name: "사진 삭제", exact: true }),
  ).toBeDisabled();
  const pickerPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 추가", exact: true }).click();
  await (
    await pickerPromise
  ).setFiles({ name: "synthetic.png", mimeType: "image/png", buffer: png });
  await expect(
    page.locator(".photo-section > .photo-grid .photo-open"),
  ).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("사진을 저장했어요");
  await expect(
    page.getByRole("link", { name: "원본 녹음 내려받기" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "일기와 원본 삭제", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /그날의 목소리 듣기/ }).click();
  const listen = page.getByRole("dialog", { name: "원래 이야기", exact: true });
  await expect(listen.locator("audio")).toHaveJSProperty("duration", 2);
  await expect(listen.getByText(/글을 수정해도 원본은 바뀌지/)).toHaveCount(0);
  await expect(listen.getByText(/현재 녹음 전체를 한 구간/)).toHaveCount(0);
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-audio-download.png",
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    listen.getByRole("link", { name: "원본 녹음 내려받기" }).click(),
  ]);
  expect(await readFile((await download.path())!)).toEqual(wav);
  await listen.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "일기 옵션", exact: true }).click();
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-diary-actions.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "일기와 원본 삭제", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "이 추억을 삭제할까요?",
  });
  await confirmation.getByRole("button", { name: "남겨 두기" }).click();
  expect(deletes).toBe(0);
  record.photos = Array.from({ length: 8 }, (_, i) => ({
    id: `synthetic-${i}`,
  }));
  await page.reload();
  await photoMenu.click();
  await expect(
    page.getByRole("button", { name: "사진 추가", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "사진 삭제", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "docs/evidence/connected-ui/phone-photo-actions.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "일기 옵션", exact: true }).click();
  await page
    .getByRole("button", { name: "일기와 원본 삭제", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "일기와 원본 함께 삭제" })
    .click();
  await page.waitForURL("**/library");
  expect(deletes).toBe(1);
  expect(errors).toEqual([]);
  console.log(
    "PASS horizontal menus, zero-photo add/file chooser, eight-photo limit, download only inside player with identical bytes, removed helper text, diary delete cancel/confirm. Synthetic files and mocked API.",
  );
} finally {
  await browser.close();
}
