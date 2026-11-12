import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
const rows = [
  { id: "segment-1", text: "첫 번째 합성 원문", start_ms: 1000, end_ms: 2200 },
  { id: "segment-2", text: "두 번째 합성 원문", start_ms: 5000, end_ms: 7000 },
  {
    id: "segment-3",
    text: "시간을 확인하지 못한 발언",
    start_ms: null,
    end_ms: null,
  },
];
const memory = {
  id: "synthetic.wav",
  saved: true,
  draft_current: true,
  audio_ready: true,
  photos: [],
  snapshot: {
    recorded_at: "2099-11-11T12:00:00Z",
    speaker: "합성 가족",
    duration_ms: 12000,
    text: "수정한 확인문",
    raw_history: [rows.map((r) => r.text).join("\n")],
    speech_timeline: {
      source: "pleos_epd_pcm_v1",
      raw_history_index: 0,
      segments: rows,
    },
    draft: JSON.stringify({
      groups: [
        { label: "합성 일기", statements: [{ text: "완성한 일기 본문" }] },
      ],
    }),
  },
};
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
        : { width: 390, height: 844 },
    });
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    let legacy = false;
    await p.addInitScript(
      ({ native, memory }) => {
        const w = window as any;
        w.__name = (v: any) => v;
        w.state = { theme_mode: "auto", theme_dark: false };
        w.EventSource = undefined;
        w.emit = (patch: any) => {
          w.state = { ...w.state, ...patch };
          w.nativeStatus(w.state);
        };
        w.calls = [];
        const OriginalAudio = w.Audio;
        w.Audio = function () {
          const a = new OriginalAudio();
          w.qaAudio = a;
          return a;
        };
        if (native)
          w.NativeDiary = {
            theme() {
              return JSON.stringify(w.state);
            },
            invoke(raw: string) {
              const r = JSON.parse(raw);
              w.calls.push(r);
              if (r.cmd === "setTheme")
                w.state = {
                  ...w.state,
                  theme_mode: r.mode,
                  theme_dark: r.mode === "dark",
                };
              if (r.cmd === "playSegment") {
                const segment = memory.snapshot.speech_timeline.segments.find(
                  (s) => s.id === r.segmentId,
                )!;
                w.state = {
                  position: segment.start_ms! / 1000,
                  playing: true,
                  audio_memory: memory.id,
                  memoryId: memory.id,
                };
              }
              setTimeout(
                () =>
                  w.NativeReply(
                    r.id,
                    r.cmd === "read"
                      ? memory
                      : r.cmd === "list"
                        ? { items: [memory] }
                        : w.state,
                  ),
                0,
              );
            },
          };
      },
      { native, memory },
    );
    await p.route("https://timeline.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/audio")) {
        const b = Buffer.alloc(44 + 32000 * 12);
        b.write("RIFF");
        b.writeUInt32LE(b.length - 8, 4);
        b.write("WAVEfmt ", 8);
        b.writeUInt32LE(16, 16);
        b.writeUInt16LE(1, 20);
        b.writeUInt16LE(1, 22);
        b.writeUInt32LE(16000, 24);
        b.writeUInt32LE(32000, 28);
        b.writeUInt16LE(2, 32);
        b.writeUInt16LE(16, 34);
        b.write("data", 36);
        b.writeUInt32LE(b.length - 44, 40);
        await route.fulfill({ body: b, contentType: "audio/wav" });
        return;
      }
      if (path.startsWith("/api/")) {
        const m = structuredClone(memory);
        if (legacy) delete (m.snapshot as any).speech_timeline;
        if (path.endsWith("/sessions")) {
          await route.fulfill({ json: { items: [m] } });
          return;
        }
        if (path.endsWith("/devices")) {
          await route.fulfill({ json: { devices: [] } });
          return;
        }
        await route.fulfill({ json: m });
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
      await p.goto(
        `https://timeline.test/faithful/app.html#${native ? "carhome" : "main"}`,
      );
      await expect(p.locator("[data-theme-toggle]")).toBeVisible();
      await p.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      if (native) await p.locator("[data-theme-auto]").click();
      else await p.evaluate(() => (window as any).DiaryTheme.set("light"));
      await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
      await p
        .getByRole("button", { name: "다크 모드로 전환", exact: true })
        .click();
      await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
      await p
        .getByRole("button", { name: "라이트 모드로 전환", exact: true })
        .click();
      await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
      if (!native) {
        await p.reload();
        await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
        await p.emulateMedia({ colorScheme: "dark" });
        await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
        await expect(p.locator("[data-theme-auto]")).toHaveCount(0);
        await p
          .getByRole("button", { name: "다크 모드로 전환", exact: true })
          .click();
        await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
      }
      for (const theme of ["light", "dark"]) {
        const button = p.getByRole("button", {
          name: theme === "light" ? "라이트 모드로 전환" : "다크 모드로 전환",
          exact: true,
        });
        if (await button.count()) await button.click();
        await p.screenshot({
          path: `docs/evidence/connected-ui/c027-${native ? "car" : "phone"}-${width}-${theme}.png`,
        });
      }
      for (const route of native
        ? ["carhome", "carlist", "cardetail"]
        : ["detail", "transcript", "connect"]) {
        await p.goto(
          `https://timeline.test/faithful/app.html#${route}?id=synthetic.wav`,
        );
        await expect(p.locator("[data-theme-toggle]")).toBeVisible();
        const before = await p.locator("html").getAttribute("data-theme");
        await p.evaluate(() => {
          (window as any).keptRoot =
            document.querySelector("#app")!.firstElementChild;
        });
        await p.locator("[data-theme-toggle]").click();
        await expect(p.locator("html")).toHaveAttribute(
          "data-theme",
          before === "dark" ? "light" : "dark",
        );
        expect(
          await p.evaluate(
            () =>
              (window as any).keptRoot ===
              document.querySelector("#app")!.firstElementChild,
          ),
        ).toBe(true);
        expect(
          await p.locator("[data-theme-toggle]").evaluate((b) => {
            const r = b.getBoundingClientRect();
            return (
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.width >= 44 &&
              r.height >= 44
            );
          }),
        ).toBe(true);
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (!native && route === "transcript") {
          const row = p.locator("button.timeline-segment").nth(1);
          await row.click();
          await expect(row).not.toHaveAttribute("aria-busy", "true");
          await p.locator("[data-theme-toggle]").click();
          expect(await p.evaluate(() => (window as any).qaAudio.paused)).toBe(
            false,
          );
          await p.screenshot({
            path: `docs/evidence/connected-ui/c027-phone-${width}-transcript.png`,
          });
        }
      }
    }
    if (native) {
      await p.evaluate(() => {
        (window as any).state = {
          ...(window as any).state,
          recording: true,
          paused: false,
          elapsed: 4,
          level: 0,
          stt_text: "합성 실시간 이야기",
        };
      });
      await p.goto("https://timeline.test/faithful/app.html#recording");
      await expect(p.locator("[data-input-wave] > span")).toHaveCount(20);
      for (const theme of ["light", "dark"]) {
        if ((await p.locator("html").getAttribute("data-theme")) !== theme)
          await p.locator("[data-theme-toggle]").click();
        await expect(p.locator("html")).toHaveAttribute("data-theme", theme);
        await p.evaluate(() => {
          const w = window as any;
          for (let n = 0; n < 20; n++)
            w.emit({
              ...w.state,
              recording: true,
              paused: false,
              level: 0.15 + (0.7 * (1 + Math.sin(n * 0.8))) / 2,
              elapsed: 7,
            });
        });
        await expect(p.locator("[data-timer]")).toHaveText("0:07");
        expect(
          await p
            .locator("[data-input-wave] > span")
            .last()
            .evaluate((b) => b.getBoundingClientRect().height),
        ).toBeGreaterThan(40);
        await p.locator("[data-theme-toggle]").click();
        await expect(p.locator("[data-input-wave] > span")).toHaveCount(20);
        await expect(p.locator("html")).toHaveAttribute(
          "data-theme",
          theme === "light" ? "dark" : "light",
        );
        await p.locator("[data-theme-toggle]").click();
        await expect(p.locator("html")).toHaveAttribute("data-theme", theme);
        await p.screenshot({
          path: `docs/evidence/connected-ui/c027-recording-${theme}.png`,
        });
        await p.evaluate(() => {
          const w = window as any;
          for (let n = 0; n < 20; n++)
            w.emit({
              ...w.state,
              recording: true,
              paused: false,
              level: 0,
            });
        });
        await expect(p.locator("[data-input-wave]")).toHaveAttribute(
          "aria-label",
          "음성 입력 대기",
        );
        expect(
          await p
            .locator("[data-input-wave] > span")
            .last()
            .evaluate((b) => b.getBoundingClientRect().height),
        ).toBe(4);
        await p.evaluate(() => {
          const w = window as any;
          w.emit({
            ...w.state,
            recording: true,
            paused: true,
            level: 0.9,
          });
        });
        await expect(p.locator("[data-input-wave]")).toHaveAttribute(
          "aria-label",
          "녹음 일시정지",
        );
        await p.evaluate(() => {
          const w = window as any;
          w.state = { ...w.state, recording: true, paused: false, level: 0.8 };
          w.emit(w.state);
        });
        await expect(p.locator("[data-input-wave]")).toHaveAttribute(
          "aria-label",
          "음성 입력 중",
        );
      }
    }
    expect(errors).toEqual([]);
    await p.close();
  }
  console.log(
    "PASS C027 direct theme/auto/persistence; media and DOM retained; responsive controls; real recording template level, silence, pause/resume in both themes.",
  );
} finally {
  await browser.close();
}
