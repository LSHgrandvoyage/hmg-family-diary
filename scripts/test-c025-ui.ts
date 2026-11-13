import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
const records = ["첫차", "새차", "첫차"].map((nickname, index) => ({
  id: `synthetic-${index}.wav`,
  revision: 1,
  saved: index !== 2,
  audio_ready: true,
  draft_current: true,
  photos: [],
  shared: index === 0,
  linked: index !== 2,
  sync_status: ["shared", "pending", "local"][index],
  snapshot: {
    recorded_at: "2099-11-10T12:00:00Z",
    duration_ms: 40000,
    speaker: "합성 가족",
    text: `합성 이야기 ${index}`,
    draft: JSON.stringify({
      groups: [
        {
          label: `합성 일기 ${index}`,
          statements: [{ text: `합성 이야기 ${index}` }],
        },
      ],
    }),
    context: {
      vehicle: {
        nickname,
        brand: "합성",
        model: "시험 모델",
        year: "2099",
        plate: "",
      },
      location: { status: "stale", observed_at: null, label: null },
    },
  },
}));
await mkdir("test-results/c025", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  async function page(width: number, height: number, native = false) {
    const p = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(
      ({ records, native }) => {
        const w = window as any;
        w.__name = (value: unknown) => value;
        w.EventSource = undefined;
        const OriginalAudio = w.Audio;
        w.Audio = function () {
          const value = new OriginalAudio();
          w.liveAudio = value;
          return value;
        };
        if (native) {
          w.state = { paired: true, sync_pending: true };
          w.commands = [];
          w.queue = [];
          w.NativeDiary = {
            invoke(raw: string) {
              const r = JSON.parse(raw);
              w.commands.push(r);
              if (r.cmd === "ttsQueue") {
                w.queue = [...r.memoryIds];
                w.state.tts_index = 0;
                w.state.tts_active = true;
              }
              if (r.cmd === "ttsNext") w.state.tts_index++;
              if (r.cmd === "ttsPrevious") w.state.tts_index--;
              if (r.cmd === "stopPlayback") {
                w.state.tts_active = false;
                w.queue = [];
              }
              if (r.cmd.startsWith("tts") || r.cmd === "stopPlayback") {
                w.state.tts_count = w.queue.length;
                w.state.tts_title = records.find(
                  (m: any) => m.id === w.queue[w.state.tts_index],
                )?.snapshot.text;
                w.state.tts_previous =
                  w.state.tts_active && w.state.tts_index > 0;
                w.state.tts_next =
                  w.state.tts_active && w.state.tts_index < w.queue.length - 1;
              }
              w.state.playback = {
                active: !!w.state.tts_active,
                mode: "diary",
                title: w.state.tts_title,
                position: 0,
                playing: !!w.state.tts_active,
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
        }
      },
      { records, native },
    );
    await p.route("https://diary-c021.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/audio")) {
        const wav = Buffer.alloc(44 + 32000 * 8);
        wav.write("RIFF");
        wav.writeUInt32LE(wav.length - 8, 4);
        wav.write("WAVEfmt ", 8);
        wav.writeUInt32LE(16, 16);
        wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(16000, 24);
        wav.writeUInt32LE(32000, 28);
        wav.writeUInt16LE(2, 32);
        wav.writeUInt16LE(16, 34);
        wav.write("data", 36);
        wav.writeUInt32LE(wav.length - 44, 40);
        await route.fulfill({ body: wav, contentType: "audio/wav" });
        return;
      }
      if (path.endsWith("/devices")) {
        await route.fulfill({ json: { devices: [] } });
        return;
      }
      if (path.startsWith("/api/v1/")) {
        await route.fulfill({
          json: path.endsWith("sessions") ? { items: records } : records[0],
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
                ".js": "text/javascript",
                ".css": "text/css",
                ".woff2": "font/woff2",
              } as any
            )[extname(path)] || "application/octet-stream",
        });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
    await p.goto(
      `https://diary-c021.test/faithful/app.html#${native ? "carlist" : "main"}`,
    );

    await expect(p.getByText(/우리 가족.*차 안의 이야기/)).toHaveCount(0);
    await expect(p.locator(".vehicle-filter-bar")).toHaveCount(0);
    await expect(
      p.getByRole("button", { name: "검색", exact: true }),
    ).toHaveCount(1);
    await p.getByRole("button", { name: "검색", exact: true }).click();
    await p.getByLabel("일기 검색어").fill("합성 이야기 0");
    await p
      .getByLabel("기록 당시 차량 필터")
      .selectOption({ label: "첫차 · 합성 · 시험 모델 · 2099" });
    await p.getByLabel("일기 검색어").press("Enter");
    await expect(p.getByText("합성 일기 0", { exact: true })).toBeVisible();
    await expect(p.getByText("합성 일기 2", { exact: true })).toHaveCount(0);
    await p.getByRole("button", { name: "검색", exact: true }).click();
    await expect(p.getByLabel("일기 검색어")).toHaveValue("합성 이야기 0");
    await p.getByRole("button", { name: "초기화", exact: true }).click();
    await expect(p.getByText("합성 일기 2", { exact: true })).toBeVisible();
    if (native) {
      const start = p.getByRole("button", {
        name: "일기 2편 이어 듣기",
        exact: true,
      });
      await expect(start).toBeEnabled();
      await p.getByRole("button", { name: "검색", exact: true }).click();
      await p
        .getByLabel("기록 당시 차량 필터")
        .selectOption({ label: "첫차 · 합성 · 시험 모델 · 2099" });
      await p.getByRole("button", { name: "적용", exact: true }).click();
      await p
        .getByRole("button", { name: "일기 1편 이어 듣기", exact: true })
        .click();
      expect(await p.evaluate(() => (window as any).queue)).toEqual([
        "synthetic-0.wav",
      ]);
      await expect(
        p.getByRole("button", { name: "이전 일기", exact: true }),
      ).toBeDisabled();
      await expect(
        p.getByRole("button", { name: "다음 일기", exact: true }),
      ).toBeDisabled();
      await p.getByRole("button", { name: "재생 종료", exact: true }).click();
      await p.getByRole("button", { name: "검색", exact: true }).click();
      await p.getByRole("button", { name: "초기화", exact: true }).click();
      await start.click();
      expect(await p.evaluate(() => (window as any).queue)).toEqual([
        "synthetic-0.wav",
        "synthetic-1.wav",
      ]);
      await expect(start).toBeDisabled();
      await expect(
        p.getByRole("button", { name: "이전 일기", exact: true }),
      ).toBeDisabled();
      await p.getByRole("button", { name: "다음 일기", exact: true }).click();
      await expect(p.locator("[data-player-title]")).toContainText(
        "합성 이야기 1",
      );
      await expect(
        p.getByRole("button", { name: "다음 일기", exact: true }),
      ).toBeDisabled();
      await p.getByRole("button", { name: "이전 일기", exact: true }).click();
      await expect(p.locator("[data-player-mode]")).toContainText("일기 낭독");
    }
    for (const mode of ["light", "dark"]) {
      await p.evaluate((mode) => (window as any).DiaryTheme.set(mode), mode);
      await expect(p.locator("html")).toHaveAttribute("data-theme", mode);
      await expect(p.locator(".library-search")).toHaveCSS(
        "color",
        mode === "dark" ? "rgb(242, 244, 248)" : "rgb(21, 25, 35)",
      );
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await p.screenshot({
        path: `test-results/c025/c025-${native ? "car" : "phone"}-${width}-${mode}.png`,
      });
    }
    if (native) {
      await p.goto(
        "https://diary-c021.test/faithful/app.html#cardetail?id=synthetic-0.wav",
      );
      await expect(p.locator("[data-player-mode]")).toContainText("일기 낭독");
      await p.screenshot({
        path: "test-results/c025/c025-detail-active-dark.png",
      });
      await p.getByRole("button", { name: "재생 종료", exact: true }).click();
      await expect(p.locator(".parked-player")).toBeHidden();
      // Browsing another diary must not borrow the background original's waveform position.
      await p.evaluate(() => {
        const w = window as any;
        Object.assign(w.state, {
          audio_busy: true,
          audio_memory: "synthetic-1.wav",
          memoryId: "synthetic-1.wav",
          position: 15,
          playing: true,
        });
        w.nativeStatus(w.state);
      });
      await expect(
        p.getByRole("slider", { name: "녹음 재생 위치" }),
      ).toHaveValue("0");
      await p.evaluate(() => {
        const w = window as any;
        Object.assign(w.state, {
          audio_memory: "synthetic-0.wav",
          memoryId: "synthetic-0.wav",
          playing: false,
        });
        w.nativeStatus(w.state);
      });
      await expect(
        p.getByRole("slider", { name: "녹음 재생 위치" }),
      ).toHaveValue("15");
      await p.getByRole("slider", { name: "녹음 재생 위치" }).fill("20");
      expect(
        await p.evaluate(
          () =>
            (window as any).commands.filter((c: any) => c.cmd === "seek").at(-1)
              ?.memoryId,
        ),
      ).toBe("synthetic-0.wav");
      await p.evaluate(() => {
        const w = window as any;
        Object.assign(w.state, {
          audio_busy: false,
          audio_memory: null,
          playing: false,
          position: 0,
        });
        w.nativeStatus(w.state);
      });
    }
    for (const target of native
      ? ["carhome", "cardetail", "carreview", "recording"]
      : ["detail", "transcript", "connect"]) {
      await p.goto(
        `https://diary-c021.test/faithful/app.html#${target}?id=synthetic-0.wav`,
      );
      await expect(p.locator(`[data-page="${target}"]`)).toBeVisible();
      for (const mode of ["light", "dark"]) {
        await p.evaluate((mode) => (window as any).DiaryTheme.set(mode), mode);
        await expect(p.locator("html")).toHaveAttribute("data-theme", mode);
        const failures = await p.evaluate(() => {
          const rgb = (s: string) =>
            s
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number);
          const lum = (c: number[]) =>
            c
              .map((x) => {
                x /= 255;
                return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
              })
              .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
          return [...document.querySelectorAll<HTMLElement>("#app *")]
            .filter(
              (e) =>
                e.children.length === 0 &&
                e.textContent?.trim() &&
                e.getBoundingClientRect().width > 0 &&
                getComputedStyle(e).visibility !== "hidden" &&
                !e.closest("button:disabled"),
            )
            .flatMap((e) => {
              const css = getComputedStyle(e);
              let parent: HTMLElement | null = e;
              let bg = "";
              while (parent) {
                bg = getComputedStyle(parent).backgroundColor;
                if (!bg.endsWith(", 0)") && bg !== "transparent") break;
                parent = parent.parentElement;
              }
              if (!parent || Number(css.opacity) < 1) return [];
              const a = lum(rgb(css.color)),
                b = lum(rgb(bg)),
                ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
              const large =
                parseFloat(css.fontSize) >= 24 ||
                (parseFloat(css.fontSize) >= 18.66 &&
                  Number(css.fontWeight) >= 700);
              return ratio < (large ? 3 : 4.5)
                ? [
                    {
                      text: e.textContent!.trim().slice(0, 20),
                      ratio,
                      color: css.color,
                      bg,
                    },
                  ]
                : [];
            });
        });
        expect(failures, `${target} ${mode} text contrast`).toEqual([]);
        if (width === 375 || target === "recording" || target === "cardetail")
          await p.screenshot({
            path: `test-results/c025/c025-${target}-${mode}.png`,
          });
      }
    }
    expect(errors).toEqual([]);
    await p.close();
  }
  await page(1280, 720, true);
  console.log(
    "PASS vehicle playlist filtered queue, excludes drafts, newest order, previous/next boundaries/stop; light/dark 1280x720 layouts and contrast.",
  );
} finally {
  await browser.close();
}
