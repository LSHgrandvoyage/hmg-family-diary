import sharp from "sharp";
import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const fixture = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const png = await readFile(".tools/runtime/qa-photo.png");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let photoMode = "normal",
    photoReleases: (() => Promise<void>)[] = [];
  const portrait = await sharp({
    create: { width: 240, height: 480, channels: 3, background: "#719b84" },
  })
    .png()
    .toBuffer();
  const landscape = await sharp({
    create: { width: 800, height: 200, channels: 3, background: "#ddaf82" },
  })
    .png()
    .toBuffer();
  let mode = "success",
    uploads = 0,
    release: () => Promise<void> = async () => {};
  const m = {
    id: fixture.id,
    snapshot: fixture.snapshot,
    audio_ready: true,
    photos: [] as { id: string }[],
  };
  await page.route("https://upload.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/faithful/")) {
      const file = path.slice("/faithful/".length);
      return route.fulfill({
        body: await readFile(join("apps/web/public/faithful", file)),
        contentType: (
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".woff2": "font/woff2",
          } as Record<string, string>
        )[extname(file)],
      });
    }
    if (path.endsWith("/photos") && route.request().method() === "POST") {
      uploads++;
      if (mode === "failure")
        return route.fulfill({
          status: 422,
          json: { error: { code: "INVALID_PHOTO" } },
        });
      if (mode === "network") return route.abort("failed");
      if (mode === "pending") {
        release = () => route.fulfill({ json: m });
        return;
      }
      m.photos.unshift({ id: "new-" + uploads });
      return route.fulfill({ json: m });
    }
    if (path.includes("/photos/")) {
      const body = path.endsWith("portrait")
        ? portrait
        : path.endsWith("landscape")
          ? landscape
          : png;
      if (photoMode === "error")
        return route.fulfill({ status: 503, body: "" });
      if (photoMode === "pending") {
        photoReleases.push(() =>
          route.fulfill({ body, contentType: "image/png" }),
        );
        return;
      }
      return route.fulfill({ body, contentType: "image/png" });
    }
    return route.fulfill({ json: m });
  });
  const url = "https://upload.test/faithful/app.html#detail?id=" + m.id;
  await page.goto(url);
  const add = page.getByRole("button", { name: "사진 추가", exact: true });
  async function choose(
    buffer: Buffer,
    name = "test.png",
    mimeType = "image/png",
  ) {
    const picker = page.waitForEvent("filechooser");
    await add.click();
    await expect(page.locator("input[type=file]")).toHaveCount(1);
    await (await picker).setFiles({ buffer, name, mimeType });
  }
  await choose(Buffer.alloc(18 * 1024 * 1024));
  await expect(page.getByRole("dialog")).toContainText("18.0MB");
  expect(uploads).toBe(0);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await page.screenshot({
    path: "docs/evidence/connected-ui/c018-size-alert.png",
  });
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await choose(Buffer.from("not a supported image"), "test.heic", "image/heic");
  await expect(page.getByRole("dialog")).toContainText("HEIC");
  expect(uploads).toBe(0);
  await page.getByRole("button", { name: "확인", exact: true }).click();
  mode = "failure";
  await choose(png);
  await expect(page.getByRole("dialog")).toContainText("해상도");
  await expect(add).toBeEnabled();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  mode = "network";
  await choose(png);
  await expect(page.getByRole("dialog")).toContainText("서버 연결");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await page.clock.install();
  mode = "pending";
  await choose(png);
  await expect(page.locator("[data-photo-status]")).toHaveText(
    "사진을 올리고 있어요…",
  );
  await expect(add).toBeDisabled();
  await page.clock.runFor(46000);
  await expect(page.getByRole("dialog")).toContainText("전송 응답이 늦어지고");
  await expect(add).toBeEnabled();
  await release();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  mode = "success";
  await choose(png);
  await expect(page.locator("[data-photo-status]")).toHaveText(
    "사진을 추가했어요.",
  );
  await expect(
    page.getByRole("button", { name: "사진 1 크게 보기" }),
  ).toBeVisible();
  m.photos = Array.from({ length: 8 }, (_, i) => ({ id: "p" + i }));
  await page.reload();
  await add.click();
  await expect(page.getByRole("dialog")).toContainText("8장");
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await page.getByRole("button", { name: "확인", exact: true }).click();
  m.photos = [{ id: "portrait" }, { id: "landscape" }];
  photoMode = "pending";
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator('.photo-strip [data-photo-state="loading"]'),
  ).toHaveCount(2);
  await expect(page.getByText("사진 불러오는 중…").first()).toBeVisible();
  await expect.poll(() => photoReleases.length).toBe(2);
  photoMode = "normal";
  await Promise.all(photoReleases.map((fn) => fn()));
  await expect(
    page.locator('.photo-strip [data-photo-state="ready"]'),
  ).toHaveCount(2);
  const sizes = await page
    .locator(".photo-strip .photo-frame")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect(),
          img = n.querySelector("img")!,
          i = img.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          imageWidth: i.width,
          imageHeight: i.height,
          ratio: img.naturalWidth / img.naturalHeight,
          bg: getComputedStyle(n).backgroundColor,
        };
      }),
    );
  for (const s of sizes) {
    expect(s.width / s.height).toBeCloseTo(s.ratio, 2);
    expect(s.width).toBeCloseTo(s.imageWidth, 1);
    expect(s.height).toBeCloseTo(s.imageHeight, 1);
    expect(s.bg).toBe("rgba(0, 0, 0, 0)");
  }
  await page.screenshot({
    path: "docs/evidence/connected-ui/c018-natural-photos.png",
    fullPage: true,
  });
  photoMode = "error";
  await page.reload();
  await expect(
    page.locator('.photo-strip [data-photo-state="error"]'),
  ).toHaveCount(2);
  await expect(
    page.getByText(/사진을 불러오지 못했어요/).first(),
  ).toBeVisible();
  photoMode = "normal";
  await page.getByRole("button", { name: "사진 1 크게 보기" }).click();
  await expect(
    page.locator('.photo-strip [data-photo-state="ready"]'),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
  console.log(
    "PASS attached picker, 18MB/HEIC rejection before upload, server/network errors, pending feedback/duplicate prevention/timeout, successful retry, explicit 8-photo limit.",
  );
} finally {
  await browser.close();
}
