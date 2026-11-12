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
        w.state = {};
        w.EventSource = undefined;
        w.calls = [];
        const OriginalAudio = w.Audio;
        w.Audio = function () {
          const a = new OriginalAudio();
          w.qaAudio = a;
          return a;
        };
        if (native)
          w.NativeDiary = {
            invoke(raw: string) {
              const r = JSON.parse(raw);
              w.calls.push(r);
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
    await p.goto(
      `https://timeline.test/faithful/app.html#${native ? "cardetail" : "transcript"}?id=synthetic.wav`,
    );
    if (native)
      await p.getByRole("button", { name: "원래 이야기", exact: true }).click();
    await expect(
      p.getByText("두 번째 합성 원문", { exact: true }),
    ).toBeVisible();
    await expect(p.getByText("수정한 확인문", { exact: true })).toHaveCount(0);
    await expect(p.getByText("시간 미확인", { exact: true })).toBeVisible();
    await expect(p.locator("button.timeline-segment")).toHaveCount(2);
    const second = p.getByRole("button", { name: /0:05부터 재생/ });
    await second.focus();
    await p.keyboard.press("Enter");
    if (native) {
      expect(
        await p.evaluate(
          () =>
            (window as any).calls
              .filter((r: any) => r.cmd === "playSegment")
              .at(-1).segmentId,
        ),
      ).toBe("segment-2");
    } else {
      await expect
        .poll(() => p.evaluate(() => (window as any).qaAudio.currentTime))
        .toBeGreaterThanOrEqual(5);
      expect(await p.evaluate(() => (window as any).qaAudio.paused)).toBe(
        false,
      );
    }
    await expect(second).toHaveAttribute("aria-current", "true");
    await expect(second).not.toHaveAttribute("aria-busy", "true");
    // Gap does not pretend either utterance is being spoken; pause preserves position selection.
    if (native)
      await p.evaluate(() =>
        (window as any).nativeStatus({
          position: 3,
          playing: false,
          audio_memory: "synthetic.wav",
        }),
      );
    else
      await p.evaluate(() => {
        (window as any).qaAudio.pause();
        (window as any).qaAudio.currentTime = 3;
      });
    await expect(
      p.locator('.timeline-segment[aria-current="true"]'),
    ).toHaveCount(0);
    await expect(p.locator("dialog[open]")).toHaveCount(0);
    for (const theme of ["light", "dark"]) {
      await p.evaluate((t) => (window as any).DiaryTheme.set(t), theme);
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await p
          .locator(".timeline-segment")
          .evaluateAll((rows) =>
            rows.every((r) => r.getBoundingClientRect().right <= innerWidth),
          ),
      ).toBe(true);
      await p.screenshot({
        path: `docs/evidence/connected-ui/c026-${native ? "car" : "phone"}-${theme}.png`,
      });
    }
    if (!native) {
      legacy = true;
      await p.reload();
      await expect(p.locator("button.timeline-segment")).toHaveCount(0);
      await expect(
        p.getByText("이 기록에는 발언별 시간 정보가 없어요.", { exact: true }),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
    await p.close();
  }
  console.log(
    "PASS original segments vs edited text; keyboard seek+play, unknown time non-interactive, gap highlight, legacy fallback; phone/car light/dark.",
  );
} finally {
  await browser.close();
}
