import { test, expect } from "@playwright/test";

test("archive groups by year and month and combines period with search", async ({
  page,
}, info) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "함께한 날을 다시 꺼내 봐요" }),
  ).toBeVisible();
  await expect(page.locator(".month-group")).toHaveCount(3);
  await expect(page.locator(".month-group").first()).toContainText(
    "2026년 11월",
  );
  await expect(
    page.getByRole("button", { name: "바다", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "기록 기간" })
    .selectOption("2026-10");
  await expect(page.locator(".story-row")).toHaveCount(1);
  await expect(page.locator(".story-row")).toContainText(
    "비를 기다리며 나눈 이야기",
  );
  await page.getByRole("searchbox").fill("연을");
  await expect(
    page.getByRole("heading", { name: "찾는 이야기가 없어요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await expect(page.getByRole("combobox", { name: "기록 기간" })).toHaveValue(
    "all",
  );
  await expect(page.locator(".story-row")).toHaveCount(4);
  await page.screenshot({
    path: `docs/evidence/timeline-${info.project.name}-archive.png`,
    fullPage: true,
  });
  await page.getByRole("searchbox").fill("2026-11-01");
  await page.locator(".story-row").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "연을 따라 걷던 오후" }),
  ).toBeVisible();
});

test("one full recording seeks from transcript, crosses segment boundaries and releases on exit", async ({
  page,
}, info) => {
  let fetches = 0;
  await page.route("**/demo/synthetic-signal.wav", (route) => {
    fetches++;
    return route.continue();
  });
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL;
    (window as unknown as { revoked: number }).revoked = 0;
    URL.revokeObjectURL = function (url) {
      (window as unknown as { revoked: number }).revoked++;
      original.call(URL, url);
    };
  });
  await page.goto("/demo/sea");
  await page.getByRole("button", { name: "원래 이야기", exact: true }).click();
  const audio = page.locator("audio");
  const slider = page.getByRole("slider", { name: "전체 녹음 재생 위치" });
  await expect(
    page.getByRole("button", { name: "재생", exact: true }),
  ).toBeEnabled();
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await expect(slider).toHaveAttribute("min", "0");
  await expect(slider).toHaveAttribute("max", "8");
  const child = page.getByRole("button", { name: "아이 0:04부터 재생" });
  await child.click();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(4);
  await expect(child).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "일시 정지" }).click();
  const parent = page.getByRole("button", { name: "보호자 0:00부터 재생" });
  await parent.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeLessThan(2);
  await expect(parent).toHaveAttribute("aria-current", "true");
  await slider.fill("3.8");
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(4);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);
  await expect(child).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "일시 정지" }).click();
  await slider.fill("6");
  expect(fetches).toBe(1);
  await page.locator(".recording-controls").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/evidence/timeline-${info.project.name}-player.png`,
    fullPage: true,
  });
  await slider.fill("7.8");
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect(page.getByRole("button", { name: "다시 재생" })).toBeVisible();
  expect(await audio.evaluate((el: HTMLAudioElement) => el.ended)).toBe(true);
  await page.getByRole("button", { name: "정리된 일기", exact: true }).click();
  await expect(audio).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "정리된 일기", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => (window as unknown as { revoked: number }).revoked,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("media retry and memory shortcuts use the same full timeline", async ({
  page,
}) => {
  await page.route("**/demo/synthetic-signal.wav", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto("/demo/sea");
  await page.getByRole("button", { name: "원래 이야기", exact: true }).click();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "아이 0:04부터 재생" }),
  ).toBeDisabled();
  await page.unroute("**/demo/synthetic-signal.wav");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(
    page.getByRole("button", { name: "재생", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "재생 종료" }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  await page
    .getByRole("button", { name: "아이 이야기 듣기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "원래 이야기", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(4);
  await expect(page.getByRole("slider")).toHaveAttribute("max", "8");
  await page.getByRole("button", { name: "전체 녹음 듣기" }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeLessThan(2);
  await expect(page.locator("audio")).toHaveCount(1);
  await page.getByRole("button", { name: "재생 종료" }).click();
  await expect(page.locator("audio")).toHaveCount(0);
});

test("palette remains available and timeline fits with enlarged text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "화면 설정" }).click();
  await page.getByRole("button", { name: "따뜻한 코랄" }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "coral");
  await page.getByRole("searchbox").fill("카페");
  await page.locator(".story-row").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "비를 기다리며 나눈 이야기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "원래 이야기", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--fs-body", "24px");
    document.documentElement.style.setProperty("--fs-sub", "20px");
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("recording context keeps the car and capture place together and links historical car memories", async ({
  page,
}, info) => {
  await page.goto("/demo/sea");
  const context = page.getByRole("region", { name: "그날의 차와 녹음 장소" });
  await expect(context).toContainText("현대 싼타페");
  await expect(context).toContainText("SUV · 2024년형");
  await expect(context).toContainText("강원 강릉시 · 해변 주차장 (예시)");
  await expect(context).toContainText("16:42");
  await expect(context).not.toContainText("샘플 0001");
  await context.getByRole("button", { name: "번호 보기" }).click();
  await expect(context).toContainText("샘플 0001");
  await context.getByRole("button", { name: "번호 가리기" }).click();
  await expect(context).not.toContainText("샘플 0001");
  await context.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/evidence/vehicle-${info.project.name}-detail.png`,
    fullPage: true,
  });
  await context.getByRole("link", { name: "이 차의 추억 모아보기" }).click();
  await expect(page.getByRole("combobox", { name: "함께한 차" })).toHaveValue(
    "demo-santafe",
  );
  await expect(page.locator(".story-row")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "함께한 차" })
    .selectOption("demo-avante");
  await expect(page.locator(".story-row")).toHaveCount(2);
  await expect(page.locator(".story-row").first()).toContainText("아반떼");
  await expect(page.locator(".recent-story")).toHaveAttribute(
    "href",
    "/demo/cafe",
  );
  await page.screenshot({
    path: `docs/evidence/vehicle-${info.project.name}-archive.png`,
    fullPage: true,
  });
  await page.locator('.story-row[href="/demo/cafe"]').click();
  await expect(context).toContainText("현대 아반떼");
  await expect(context).toContainText("위치 확인 못함");
  await expect(context).not.toContainText("강릉");
  await page.getByRole("button", { name: "원래 이야기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "재생", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
