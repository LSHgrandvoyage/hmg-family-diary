import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const records = [
  undefined,
  {},
  { nickname: "  ", model: "" },
  { type: "SUV" },
  { nickname: "첫차", plate: "합성1" },
  { nickname: "첫차", plate: "합성2" },
].map((vehicle, index) => ({
  id: `synthetic-${index}.wav`,
  saved: true,
  draft_current: true,
  audio_ready: true,
  photos: [],
  snapshot: {
    recorded_at: `2099-11-${String(20 - index).padStart(2, "0")}T12:00:00Z`,
    duration_ms: 1000,
    text: `합성 ${index}`,
    context: vehicle ? { vehicle } : undefined,
    draft: JSON.stringify({
      groups: [{ label: `합성 ${index}`, statements: [{ text: "합성 기록" }] }],
    }),
  },
}));
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
try {
  for (const native of [false, true]) {
    const p = await browser.newPage({
      viewport: native
        ? { width: 1280, height: 720 }
        : { width: 375, height: 844 },
    });
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(
      ({ native, records }) => {
        const w = window as any;
        w.__name = (v: any) => v;
        w.EventSource = undefined;
        w.state = { theme_mode: "auto", theme_dark: false };
        w.systemDark = false;
        if (native)
          w.NativeDiary = {
            theme: () => JSON.stringify(w.state),
            invoke: (raw: string) => {
              const r = JSON.parse(raw);
              if (r.cmd === "setTheme")
                w.state = {
                  ...w.state,
                  theme_mode: r.mode,
                  theme_dark:
                    r.mode === "auto" ? w.systemDark : r.mode === "dark",
                };
              setTimeout(
                () =>
                  w.NativeReply(
                    r.id,
                    r.cmd === "list"
                      ? { items: records }
                      : r.cmd === "read"
                        ? records.find((m) => m.id === r.memoryId)
                        : w.state,
                  ),
                0,
              );
            },
          };
      },
      { native, records },
    );
    await p.route("https://c028.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith("/api/")) {
        await route.fulfill({
          json: path.endsWith("/sessions")
            ? { items: records }
            : path.endsWith("/devices")
              ? { devices: [] }
              : records[0],
        });
        return;
      }
      try {
        await route.fulfill({
          body: await readFile(join("apps/web/public", path)),
          contentType:
            (
              {
                ".html": "text/html",
                ".css": "text/css",
                ".js": "text/javascript",
                ".woff2": "font/woff2",
              } as any
            )[extname(path)] || "application/octet-stream",
        });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
    for (const width of native ? [1280] : [375, 390, 812]) {
      await p.setViewportSize({
        width,
        height: native ? 720 : width === 812 ? 375 : 844,
      });
      await p.emulateMedia({ colorScheme: "light" });
      await p.goto(
        `https://c028.test/faithful/app.html#${native ? "carlist" : "main"}`,
      );
      if (native) {
        const auto = p.locator("[data-theme-auto]");
        await auto.click();
        await expect(auto).toHaveText("자동라이트");
        await expect(auto).toHaveAttribute("aria-pressed", "true");
        await expect(p.locator(".theme-notice")).toContainText(
          `${native ? "차량" : "휴대폰"} 화면 설정을 따라요`,
        );
        await p.evaluate(() => {
          const w = window as any;
          w.systemDark = true;
          w.state = { theme_mode: "auto", theme_dark: true };
          w.nativeStatus(w.state);
        });
        await expect(auto).toHaveText("자동다크");
        await p
          .getByRole("button", { name: "라이트 모드로 전환", exact: true })
          .click();
        await expect(auto).toHaveText("자동");
        await expect(auto).toHaveAttribute("aria-pressed", "false");
      } else {
        await expect(p.locator("[data-theme-auto]")).toHaveCount(0);
        await p.evaluate(() => (window as any).DiaryTheme.set("light"));
      }
      for (const theme of ["light", "dark"]) {
        if (theme === "dark")
          await p
            .getByRole("button", { name: "다크 모드로 전환", exact: true })
            .click();
        const trigger = p.getByRole("button", {
          name: "검색",
          exact: true,
        });
        await trigger.click();
        const d = p.locator("dialog[open]");
        const close = d.getByRole("button", {
          name: "검색 닫기",
          exact: true,
        });
        await expect(
          d.getByRole("button", { name: "닫기", exact: true }),
        ).toHaveCount(0);
        const labels = await d.locator("select option").allTextContents();
        expect(labels).toEqual([
          "모든 차량",
          "차량 정보 없음",
          "SUV",
          "첫차 · 합성1",
          "첫차 · 합성2",
        ]);
        const bounds = await close.boundingBox();
        const dialogBounds = await d.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.x).toBeGreaterThan(
          dialogBounds!.x + dialogBounds!.width / 2,
        );
        await p.screenshot({
          path: `docs/evidence/connected-ui/c028-${native ? "car" : "phone"}-${width}-search-${theme}.png`,
        });
        await close.click();
        await expect(d).toHaveCount(0);
        await expect(trigger).toBeFocused();
        if (!native) {
          const family = p.getByRole("link", { name: "가족", exact: true });
          await family.click();
          const panel = p.locator("dialog[open]");
          await expect(
            panel.getByRole("button", { name: "화면 설정", exact: true }),
          ).toHaveCount(0);
          await expect(
            panel.getByRole("button", { name: "닫기", exact: true }),
          ).toHaveCount(0);
          await p.screenshot({
            path: `docs/evidence/connected-ui/c028-phone-${width}-family-${theme}.png`,
          });
          await panel
            .getByRole("button", { name: "가족 닫기", exact: true })
            .click();
          await expect(family).toBeFocused();
          await family.click();
          await p.keyboard.press("Escape");
          await expect(p.locator("dialog[open]")).toHaveCount(0);
        }
      }
      await p.getByRole("button", { name: "검색", exact: true }).click();
      await p.getByLabel("기록 당시 차량 필터").selectOption("unknown");
      await p.getByRole("button", { name: "적용", exact: true }).click();
      await expect(
        p.getByRole("button", { name: "검색", exact: true }),
      ).toHaveText("검색 · 1");
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
    await p.close();
  }
  console.log(
    "PASS automatic theme feedback, normalized historical vehicle options, mobile X panels, focus return, light/dark at 375/390/812 and vehicle 1280",
  );
} finally {
  await browser.close();
}
