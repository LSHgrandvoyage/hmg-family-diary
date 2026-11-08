import { test, expect } from "@playwright/test";
test("read, inspect sources, replay a selected interval, and release media", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "같은 바다, 서로 다른 마음" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "원래 이야기 펼치기" }).click();
  await expect(page.locator(".transcript")).toContainText("바다가 좋았어.");
  await page
    .getByRole("button", { name: "이 이야기의 소리 듣기" })
    .nth(1)
    .click();
  const audio = page.locator("audio");
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState))
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBe(4);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.duration)).toBe(8);
  await audio.evaluate((el: HTMLAudioElement) => el.play());
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(4);
  await page.screenshot({
    path: `docs/evidence/preview-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "재생 종료" }).click();
  await expect(audio).toHaveCount(0);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.screenshot({
    path: `docs/evidence/preview-${testInfo.project.name}-dark.png`,
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("a failed media fetch provides retry", async ({ page }) => {
  await page.route("**/demo/synthetic-signal.wav", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto("/demo");
  await page.getByRole("button", { name: "전체 소리 듣기" }).click();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await page.unroute("**/demo/synthetic-signal.wav");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.readyState),
    )
    .toBeGreaterThanOrEqual(1);
});
