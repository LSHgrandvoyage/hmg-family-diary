import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
await mkdir("test-results/c038", { recursive: true });
try {
  for (const dark of [true, false]) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(
      ({ dark }) => {
        const w = window as any;
        w.__name = (v: any) => v;
        w.state = {
          driving: true,
          recording: false,
          can_record: true,
          can_play: true,
          can_narrate: true,
          audio_selected: true,
          audio_date: "2099년 11월 12일",
          theme_mode: dark ? "dark" : "light",
          theme_dark: dark,
          driving_listen: {
            mode: "diary",
            available: true,
            memory: "synthetic.wav",
            date: "2099년 11월 12일",
            previous: true,
            next: true,
          },
        };
        w.calls = [];
        w.NativeDiary = {
          theme: () => JSON.stringify(w.state),
          invoke: (raw: string) => {
            const r = JSON.parse(raw);
            w.calls.push(r);
            let value = w.state;
            if (r.cmd === "list") value = { items: [] };
            if (r.cmd === "driveAction") {
              if (r.action === "listenOriginal") {
                w.state.driving_listen.mode = "original";
                w.state.tts_active = false;
                w.state.playing = true;
              }
              if (r.action === "listenDiary") {
                w.state.driving_listen.mode = "diary";
                w.state.tts_active = true;
                w.state.playing = false;
              }
              if (r.action === "listenToggle") {
                if (w.state.driving_listen.mode === "diary")
                  w.state.tts_active = !w.state.tts_active;
                else w.state.playing = !w.state.playing;
              }
              if (r.action === "record")
                Object.assign(w.state, {
                  recording: true,
                  elapsed: 42,
                  level: 0.8,
                });
              if (r.action === "pause") w.state.paused = !w.state.paused;
              if (r.action === "finish")
                Object.assign(w.state, { recording: false, stt_busy: true });
            }
            setTimeout(() => w.NativeReply(r.id, value), 0);
          },
        };
      },
      { dark },
    );
    await p.route("https://c038.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
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
              } as any
            )[extname(path)] || "application/octet-stream",
        });
      } catch {
        await route.fulfill({ status: 404, body: "" });
      }
    });
    await p.goto("https://c038.test/faithful/app.html#carhome");
    await expect(p.locator("[data-driving-surface]")).toBeVisible();
    await expect(
      p.locator("[data-live-transcript], [data-review-text], img"),
    ).toHaveCount(0);
    await expect(p.locator("[data-drive-primary]")).toHaveText(/녹음 시작/);
    await expect(p.locator('nav a[aria-disabled="true"]')).toHaveCount(3);
    await p.screenshot({
      path: `test-results/c038/c038-driving-idle-${dark ? "dark" : "light"}.png`,
    });
    await expect(
      p.getByRole("heading", { name: "일기 이어 듣기", exact: true }),
    ).toBeVisible();
    await expect(
      p.getByRole("heading", { name: "그날의 목소리", exact: true }),
    ).toHaveCount(0);
    await p.getByRole("button", { name: "일기 재생", exact: true }).click();
    await expect(
      p.getByRole("button", { name: "일기 재생 정지", exact: true }),
    ).toBeVisible();
    await p
      .getByRole("button", {
        name: "같은 일기의 원본 듣기로 전환",
        exact: true,
      })
      .click();
    await expect(
      p.getByRole("heading", { name: "그날의 목소리", exact: true }),
    ).toBeVisible();
    await expect(
      p.getByRole("heading", { name: "일기 이어 듣기", exact: true }),
    ).toHaveCount(0);
    await p.getByRole("button", { name: "원본 일시정지", exact: true }).click();
    await expect(
      p.getByRole("button", { name: "원본 재생", exact: true }),
    ).toBeVisible();
    await p.evaluate(() => {
      const w = window as any;
      w.nativeStatus({ ...w.state, playback_notice: "재생을 종료했어요." });
    });
    await expect(p.locator("[data-driving-status]")).toBeHidden();
    for (const control of await p.locator(".driving-controls button").all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(64);
      await expect(control.locator("svg")).toHaveCount(1);
      expect((await control.innerText()).trim()).toBe("");
    }
    await p.screenshot({
      path: `test-results/c038/original-${dark ? "dark" : "light"}.png`,
    });
    await p.locator("[data-drive-primary]").click();
    await expect(p.locator("[data-timer]")).toHaveText("0:42");
    await expect(p.locator("[data-driving-listen]")).toBeHidden();
    await p.evaluate(() => {
      const w = window as any;
      for (let i = 0; i < 20; i++)
        w.nativeStatus({
          ...w.state,
          stt_text: "절대로 표시하지 않을 합성 인식문",
        });
    });
    await expect(p.getByText("절대로 표시하지 않을 합성 인식문")).toHaveCount(
      0,
    );
    await expect
      .poll(() =>
        p
          .locator("[data-input-wave] span")
          .last()
          .evaluate((el) => parseFloat(getComputedStyle(el).height)),
      )
      .toBeGreaterThan(58);
    await p.screenshot({
      path: `test-results/c038/c038-driving-recording-${dark ? "dark" : "light"}.png`,
    });
    await p.locator("[data-drive-primary]").click();
    await expect(p.locator("[data-drive-primary]")).toHaveText(/이어서 녹음/);
    await p.locator('[data-drive="finish"]').click();
    await expect(p.locator("[data-driving-status]")).toHaveText(
      "원본을 보관했어요. 이야기를 글로 옮기고 있어요.",
    );
    await expect(p.locator("[data-driving-surface]")).toBeVisible();
    await p.evaluate(() => {
      const w = window as any;
      w.state = { ...w.state, driving: false, stt_busy: false };
      w.nativeStatus(w.state);
      w.restoreNativeView("carhome", null);
    });
    await expect(p.locator('[data-page="carhome"]')).toBeVisible();
    expect(
      await p.evaluate(() => {
        const w = window as any;
        return w.calls.filter((r: any) => ["read", "list"].includes(r.cmd))
          .length;
      }),
    ).toBe(1);
    expect(errors).toEqual([]);
    await p.close();
  }
  console.log(
    "PASS C038 direct D entry, reference recording layout, light/dark, audio actions, transcript hidden, parked home return. Synthetic bridge.",
  );
} finally {
  await browser.close();
}
