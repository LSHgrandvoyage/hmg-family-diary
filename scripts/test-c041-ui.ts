import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
// Synthetic records and bridge only; no account, family media, or network server.
const records = [
  {
    id: "synthetic.wav",
    saved: true,
    audio_ready: true,
    draft_current: true,
    photos: [],
    snapshot: {
      recorded_at: "2099-11-12T12:00:00Z",
      text: "합성 검증용 이야기",
      speaker: "가족",
      duration_ms: 2000,
      draft: JSON.stringify({
        groups: [
          {
            label: "합성 검증용 일기",
            statements: [{ text: "AI 생성 일기 목업 입니다." }],
          },
        ],
      }),
    },
  },
];
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
await mkdir("test-results/c041", { recursive: true });
let count = 0;
try {
  for (const native of [false, true])
    for (const theme of ["light", "dark"]) {
      const p = await browser.newPage({
        viewport: native
          ? { width: 1280, height: 720 }
          : { width: 375, height: 844 },
        reducedMotion: "reduce",
      });
      const errors: string[] = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.addInitScript(
        ({ native, theme, records }) => {
          const w = window as any;
          w.__name = (v: any) => v;
          w.EventSource = undefined;
          localStorage.setItem("chagok-theme-v1", theme);
          w.state = {
            paired: true,
            device_label: "합성 우리 차",
            vehicle: { nickname: "합성 우리 차" },
            theme_mode: theme,
            theme_dark: theme === "dark",
            driving: false,
            recording: false,
            can_record: true,
            can_play: true,
            can_narrate: true,
          };
          if (native)
            w.NativeDiary = {
              theme: () => JSON.stringify(w.state),
              invoke: (raw: string) => {
                const r = JSON.parse(raw);
                let value = { ...w.state, settings: w.state };
                if (r.cmd === "list") value = { items: records };
                setTimeout(() => w.NativeReply(r.id, value), 0);
              },
            };
        },
        { native, theme, records },
      );
      await p.route("https://c041.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.startsWith("/api/"))
          return route.fulfill({
            json: path.endsWith("/sessions")
              ? { items: records }
              : path.endsWith("/devices")
                ? { devices: [] }
                : records[0],
          });
        try {
          await route.fulfill({
            body: await readFile(join("apps/web/public", path)),
            contentType:
              (
                {
                  ".html": "text/html",
                  ".js": "text/javascript",
                  ".css": "text/css",
                  ".woff2": "font/woff2",
                  ".svg": "image/svg+xml",
                } as Record<string, string>
              )[extname(path)] || "application/octet-stream",
          });
        } catch {
          await route.fulfill({ status: 404 });
        }
      });
      const checkLogo = async (selector: string) => {
        const logo = p.locator(selector);
        await expect(logo).toBeVisible();
        await expect
          .poll(() =>
            logo.evaluate(
              (e: HTMLImageElement) =>
                e.complete &&
                e.naturalWidth === 1024 &&
                e.naturalHeight === 1024,
            ),
          )
          .toBe(true);
        const box = await logo.boundingBox();
        expect(box!.width).toBeCloseTo(box!.height, 1);
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        count++;
      };
      if (native) {
        for (const page of ["carhome", "carlist", "carsettings"]) {
          await p.goto("https://c041.test/faithful/app.html#" + page);
          await expect(p.locator(`[data-page=${page}]`)).toBeVisible();
          await checkLogo(".vehicle-brand");
          await expect(
            p.getByRole("img", { name: "차곡차곡", exact: true }),
          ).toHaveCount(1);
          await expect(p.locator(".settings-rail a")).toHaveCount(3);
          await p.screenshot({
            path: `test-results/c041/${page}-${theme}.png`,
          });
        }
        await p.evaluate(() => {
          const w = window as any;
          w.state.driving = true;
          w.nativeStatus(w.state);
        });
        await expect(p.locator("[data-driving-surface]")).toBeVisible();
        await checkLogo(".drive-brand img");
        await expect(
          p.locator(
            "[data-driving-surface] img:not(.drive-brand img), [data-live-transcript], [data-review-text]",
          ),
        ).toHaveCount(0);
        await p.screenshot({ path: `test-results/c041/driving-${theme}.png` });
      } else {
        await p.goto("https://c041.test/faithful/app.html#main");
        for (const width of [320, 375, 390, 812]) {
          await p.setViewportSize({ width, height: width === 812 ? 375 : 844 });
          await checkLogo(".mobile-brand img");
          await expect(p.locator(".mobile-brand")).toHaveText("차곡차곡");
          // Decorative logo doesn't repeat the adjacent readable app name.
          await expect(p.locator(".mobile-brand img")).toHaveAttribute(
            "alt",
            "",
          );
          const bounds = await p
            .locator(".mobile-library-header > *")
            .evaluateAll((els) =>
              els.map((e) => {
                const r = e.getBoundingClientRect();
                return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
              }),
            );
          for (let i = 0; i < bounds.length; i++)
            for (let j = i + 1; j < bounds.length; j++) {
              const a = bounds[i],
                b = bounds[j];
              expect(
                a.right <= b.x ||
                  b.right <= a.x ||
                  a.bottom <= b.y ||
                  b.bottom <= a.y,
              ).toBe(true);
            }
          expect(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await p.screenshot({
            path: `test-results/c041/phone-${width}-${theme}.png`,
          });
        }
        // Large header text remains legible without collision.
        await p.setViewportSize({ width: 375, height: 844 });
        await p
          .locator(".mobile-brand")
          .evaluate((e) => ((e as HTMLElement).style.fontSize = "32px"));
        await checkLogo(".mobile-brand img");
        await p.screenshot({
          path: `test-results/c041/phone-large-text-${theme}.png`,
        });
        await expect(
          p.getByRole("button", { name: "검색", exact: true }),
        ).toBeVisible();
      }
      await expect(p.locator("html")).toHaveAttribute("data-theme", theme);
      expect(errors).toEqual([]);
      await p.close();
    }
  console.log(
    `PASS C041: ${count} loaded logo/ratio checks; vehicle home/list/settings/driving; mobile 320/375/390/812, large header text, both themes. Synthetic data, independent headless browser.`,
  );
} finally {
  await browser.close();
}
