import { test, expect, type Page } from "@playwright/test";
async function samplePhoto(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#d8efff";
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#ffc65c";
    ctx.beginPath();
    ctx.arc(480, 100, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#73c2e8";
    ctx.fillRect(0, 250, 640, 230);
    ctx.fillStyle = "#f5d8aa";
    ctx.fillRect(0, 370, 640, 110);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return {
    name: "synthetic-beach.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}
test("photos persist locally, stay with their diary, enlarge and remain deleted after reload", async ({
  page,
}, info) => {
  await page.goto("/demo/sea");
  const photo = await samplePhoto(page);
  const gallery = page.getByRole("region", { name: "일기 사진" });
  const input = page.getByLabel("일기에 사진 추가");
  await expect(input).toBeEnabled();
  let uploads = 0;
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method())) uploads++;
  });
  await input.setInputFiles([
    photo,
    { ...photo, name: "synthetic-beach-2.png" },
  ]);
  await expect(gallery.getByRole("status")).toContainText(
    "2장의 사진을 이 브라우저에 저장",
  );
  await expect(gallery.locator(".photo-open")).toHaveCount(2);
  await gallery.getByRole("button", { name: "사진 1 크게 보기" }).click();
  await expect(page.getByRole("dialog", { name: "그날의 사진" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "선택한 일기 사진" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    gallery.getByRole("button", { name: "사진 1 크게 보기" }),
  ).toBeFocused();
  await gallery.screenshot({
    path: `docs/evidence/photos-${info.project.name}.png`,
  });
  expect(uploads).toBe(0);
  await page.reload();
  await expect(gallery.locator(".photo-open")).toHaveCount(2);
  const mimeTypes = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const r = indexedDB.open("family-diary-preview-photos", 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("photos", "readonly");
          const q = tx.objectStore("photos").getAll();
          q.onsuccess = () => resolve(q.result.map((p) => p.blob.type));
          tx.oncomplete = () => db.close();
        };
      }),
  );
  expect(mimeTypes).toEqual(["image/jpeg", "image/jpeg"]);
  await page.goto("/demo/cafe");
  await expect(page.getByLabel("일기에 사진 추가")).toBeEnabled();
  await expect(page.locator(".photo-open")).toHaveCount(0);
  await page.goto("/demo/sea");
  await expect(page.locator(".photo-open")).toHaveCount(2);
  await page.getByRole("button", { name: "사진 1 삭제" }).click();
  await expect(page.locator(".photo-open")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".photo-open")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "그날의 차와 녹음 장소" }),
  ).toContainText("16:42");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invalid files, count limits and aborted storage preserve existing photos", async ({
  page,
}) => {
  await page.goto("/demo/sea");
  const input = page.getByLabel("일기에 사진 추가");
  await expect(input).toBeEnabled();
  const photo = await samplePhoto(page);
  await input.setInputFiles(photo);
  await expect(page.locator(".photo-open")).toHaveCount(1);
  await input.setInputFiles({
    name: "pretend.png",
    mimeType: "image/png",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  });
  await expect(
    page.getByRole("region", { name: "일기 사진" }).getByRole("alert"),
  ).toContainText("JPG·PNG·WebP");
  await input.setInputFiles({
    name: "huge.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByRole("region", { name: "일기 사진" }).getByRole("alert"),
  ).toContainText("10MB");
  await input.setInputFiles(
    Array.from({ length: 8 }, (_, i) => ({ ...photo, name: `extra-${i}.png` })),
  );
  await expect(
    page.getByRole("region", { name: "일기 사진" }).getByRole("alert"),
  ).toContainText("8장");
  await expect(page.locator(".photo-open")).toHaveCount(1);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    (window as unknown as { restoreAdd: () => void }).restoreAdd = () => {
      IDBObjectStore.prototype.add = original;
    };
    IDBObjectStore.prototype.add = function (value, key) {
      const request =
        key === undefined
          ? original.call(this, value)
          : original.call(this, value, key);
      if (this.name === "photos") this.transaction.abort();
      return request;
    };
  });
  await input.setInputFiles(photo);
  await expect(
    page.getByRole("region", { name: "일기 사진" }).getByRole("alert"),
  ).toContainText("저장하지 못했어요");
  await expect(page.locator(".photo-open")).toHaveCount(1);
  await page.evaluate(() =>
    (window as unknown as { restoreAdd: () => void }).restoreAdd(),
  );
  await input.setInputFiles(photo);
  await expect(page.locator(".photo-open")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".photo-open")).toHaveCount(2);
});
test("nearby recall opens the past car memory and full recording only after a user action", async ({
  page,
}, info) => {
  await page.goto("/demo/sea");
  const panel = page.getByRole("region", { name: "이곳 근처의 예전 기억" });
  await expect(panel).toContainText("작은 조개를 찾던 날");
  await expect(panel).toContainText("첫 번째 가족 차 · 아반떼");
  await expect(page.locator("audio")).toHaveCount(0);
  await panel.screenshot({
    path: `docs/evidence/recall-${info.project.name}.png`,
  });
  await panel.getByRole("link", { name: "그때 목소리 듣기" }).click();
  await expect(page).toHaveURL(/\/demo\/sea-before\?listen=1$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "작은 조개를 찾던 날" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "재생", exact: true }),
  ).toBeEnabled();
  expect(
    await page.locator("audio").evaluate((el: HTMLAudioElement) => el.paused),
  ).toBe(true);
  await page.getByRole("button", { name: "아이 0:04부터 재생" }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(4);
  await page.goto("/demo/cafe");
  await expect(panel).toContainText("녹음 위치가 없어");
  await expect(panel.getByRole("link")).toHaveCount(0);
  await page.goto("/demo/park");
  await expect(panel).toContainText("예전 기록은 아직 없어요");
  await expect(panel.getByRole("link")).toHaveCount(0);
});
