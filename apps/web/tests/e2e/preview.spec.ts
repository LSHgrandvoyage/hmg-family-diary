import { test, expect } from "@playwright/test";

test("find a diary, inspect sources, replay a segment and release media", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL;
    (window as unknown as { revoked: number }).revoked = 0;
    URL.revokeObjectURL = function (url) {
      (window as unknown as { revoked: number }).revoked++;
      original.call(URL, url);
    };
  });
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "함께한 날을 다시 꺼내 봐요" }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/evidence/kstyle-${info.project.name}-archive.png`,
    fullPage: true,
  });
  await page.getByRole("searchbox").fill("없는 장소");
  await expect(
    page.getByRole("heading", { name: "찾는 이야기가 없어요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await expect(page.locator(".story-row")).toHaveCount(3);
  await page.getByRole("button", { name: "바다", exact: true }).click();
  await expect(page.locator(".story-row")).toHaveCount(1);
  await page.locator(".story-row").click();
  await expect(
    page.getByRole("heading", { name: "같은 바다, 서로 다른 마음", level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/evidence/kstyle-${info.project.name}-detail.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "원래 이야기", exact: true }).click();
  await expect(page.locator(".transcript")).toContainText("바다가 좋았어.");
  const trigger = page.getByRole("button", {
    name: "아이 이야기 듣기",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const audio = page.locator("audio");
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState))
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBe(4);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.duration)).toBe(8);
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(4);
  await page.getByRole("button", { name: "일시 정지" }).click();
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await page.getByRole("slider", { name: "재생 위치" }).fill("6");
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBe(6);
  await page.screenshot({
    path: `docs/evidence/kstyle-${info.project.name}-player.png`,
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(audio).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(
      () => (window as unknown as { revoked: number }).revoked,
    ),
  ).toBe(1);
  await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("media failure can be retried and playback stops at the segment boundary", async ({
  page,
}) => {
  await page.route("**/demo/synthetic-signal.wav", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto("/demo/sea");
  await page
    .getByRole("button", { name: "보호자 이야기 듣기", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await page.unroute("**/demo/synthetic-signal.wav");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(
    page.getByRole("button", { name: "재생", exact: true }),
  ).toBeEnabled();
  await page.getByRole("slider").fill("3.8");
  await page.getByRole("button", { name: "재생", exact: true }).click();
  const audio = page.locator("audio");
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBe(4);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await page.getByRole("button", { name: "재생 종료" }).click();
  await expect(audio).toHaveCount(0);
});

test("palette choice persists and the other sample diaries have distinct contents", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "화면 설정" }).click();
  await page.getByRole("button", { name: "따뜻한 코랄" }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "coral");
  await page.getByRole("searchbox").fill("공원");
  await expect(page.locator(".story-row")).toHaveCount(1);
  await page.locator(".story-row").click();
  await expect(
    page.getByRole("heading", { name: "연을 따라 걷던 오후" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "보관함", exact: true }).click();
  await page.getByRole("button", { name: "카페", exact: true }).click();
  await page.locator(".story-row").click();
  await expect(
    page.getByRole("heading", { name: "비를 기다리며 나눈 이야기" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
