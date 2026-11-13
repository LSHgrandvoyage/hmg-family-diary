import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const deployed = process.env.CHAGOK_UI_ORIGIN;
const deployedHost = process.env.CHAGOK_UI_HOST;
const origin = deployed || "https://c045.test";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
await mkdir("test-results/c045", { recursive: true });
const errors: string[] = [];
try {
  for (const theme of ["dark", "light"]) {
    const p = await browser.newPage({
      ignoreHTTPSErrors: !!deployed,
      viewport: { width: 1280, height: 720 },
      reducedMotion: "reduce",
    });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(
      ({ theme }) => {
        const w = window as any;
        w.__name = (x: any) => x;
        w.EventSource = undefined;
        w.calls = [];
        localStorage.setItem("chagok-theme-v1", theme);
        w.rows = Array.from({ length: 41 }, (_, index) => ({
          id: `synthetic-${index}.wav`,
          title: `합성 일기 ${index}`,
          day: String(index + 1),
          date: `2099년 합성 날짜 ${index + 1}`,
        }));
        w.state = {
          driving: true,
          recording: false,
          paired: false,
          can_record: false,
          theme_mode: theme,
          theme_dark: theme === "dark",
          tts_active: true,
          playing: false,
          audio_busy: true,
          driving_listen: {
            available: true,
            memory: "synthetic-20.wav",
            title: "합성 일기 20",
            index: 20,
            count: 41,
            catalog_version: 1,
            previous: true,
            next: true,
            mode: "diary",
            playing: true,
            elapsed: 5,
          },
          playback: {
            active: true,
            memory: "synthetic-20.wav",
            title: "합성 일기 20",
            mode: "diary",
            playing: true,
            position: 5,
          },
          settings: {
            paired: false,
            vehicle: { nickname: "합성 차" },
            server_configured: true,
            server_setup_available: true,
          },
        };
        w.publish = () => w.nativeStatus(w.state);
        w.NativeDiary = {
          theme: () => JSON.stringify(w.state),
          invoke: (raw: string) => {
            const r = JSON.parse(raw);
            w.calls.push(r);
            let value: any = w.state;
            if (r.cmd === "list") value = { items: [] };
            if (r.cmd === "read")
              value = {
                id: r.memoryId,
                saved: true,
                audio_ready: true,
                photos: [],
                snapshot: {
                  text: "합성 본문",
                  duration_ms: 60000,
                  recorded_at: "2099-11-13T00:00:00Z",
                  draft: JSON.stringify({
                    groups: [
                      {
                        label: "합성 일기",
                        statements: [{ text: "합성 본문" }],
                      },
                    ],
                  }),
                },
              };
            if (r.cmd === "listenPage") {
              if (w.failPageOnce) {
                w.failPageOnce = false;
                value = { error: "합성 연결 오류" };
              } else {
                const at = w.rows.findIndex(
                  (x: any) =>
                    x.id === (r.cursor || w.state.driving_listen.memory),
                );
                const reset =
                  r.direction !== "around" &&
                  r.version !== w.state.driving_listen.catalog_version;
                const direction = reset ? "around" : r.direction;
                const anchor = reset
                  ? w.rows.findIndex(
                      (x: any) => x.id === w.state.driving_listen.memory,
                    )
                  : Math.max(0, at);
                const from =
                  direction === "after" ? anchor + 1 : Math.max(0, anchor - 8);
                const to =
                  direction === "before"
                    ? anchor
                    : Math.min(w.rows.length, anchor + 9);
                value = {
                  items: w.rows.slice(from, to),
                  before: from > 0,
                  after: to < w.rows.length,
                  total: w.rows.length,
                  version: w.state.driving_listen.catalog_version,
                  reset,
                };
              }
            }
            if (r.cmd === "listenAction" || r.cmd === "driveAction") {
              const s = w.state,
                l = s.driving_listen,
                b = s.playback;
              if (r.action === "listenExit") {
                b.active = false;
                b.playing = false;
                s.tts_active = false;
                s.audio_busy = false;
                s.audio_memory = null;
                s.can_record = true;
                l.playing = false;
              }
              if (r.action === "listenToggle") {
                l.playing = !l.playing;
                b.playing = l.playing;
                l.paused = !l.playing;
                s.tts_active = l.mode === "diary";
                s.playing = l.mode === "original" && l.playing;
              }
              if (["listenDiary", "listenOriginal"].includes(r.action)) {
                l.mode = r.action === "listenDiary" ? "diary" : "original";
                b.mode = l.mode;
                s.tts_active = l.mode === "diary";
                s.audio_memory = l.mode === "original" ? l.memory : null;
                s.playing = l.mode === "original" && l.playing;
              }
              if (
                ["listenNext", "listenPrevious", "listenSelect"].includes(
                  r.action,
                )
              ) {
                const index =
                  r.action === "listenSelect"
                    ? w.rows.findIndex((x: any) => x.id === r.memoryId)
                    : l.index + (r.action === "listenNext" ? 1 : -1);
                Object.assign(l, w.rows[index], {
                  memory: w.rows[index].id,
                  index,
                  previous: index > 0,
                  next: index < w.rows.length - 1,
                });
                Object.assign(b, { memory: l.memory, title: l.title });
                if (r.action === "listenSelect") {
                  l.playing = true;
                  b.playing = true;
                }
              }
              if (r.action === "pause") s.paused = !s.paused;
            }
            setTimeout(
              () => w.NativeReply(r.id, value),
              r.cmd === "listenPage" ? w.pageDelay || 80 : 0,
            );
          },
        };
      },
      { theme },
    );
    await p.route(origin + "/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith("/api/"))
        return route.fulfill({ json: { items: [], devices: [] } });
      if (deployed) {
        if (!deployedHost) return route.continue();
        const response = await route.fetch({
          headers: { ...route.request().headers(), host: deployedHost },
        });
        return route.fulfill({ response });
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
                ".svg": "image/svg+xml",
              } as any
            )[extname(path)] || "application/octet-stream",
        });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
    await p.goto(origin + "/faithful/app.html#carhome");
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(17);
    await expect(p.locator('[data-memory="synthetic-20.wav"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(
      p.locator("[data-listen-rows] > button").first(),
    ).toHaveAttribute("data-memory", "synthetic-12.wav");
    await expect(
      p.locator("[data-listen-rows] > button").last(),
    ).toHaveAttribute("data-memory", "synthetic-28.wav");
    await p.locator("[data-listen-upcoming]").evaluate((e) => {
      e.scrollTop = 0;
    });
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(25);
    expect(
      await p.locator("[data-listen-upcoming]").evaluate((e) => e.scrollTop),
    ).toBeGreaterThan(400);
    await p.locator("[data-listen-upcoming]").evaluate((e) => {
      e.scrollTop = 0;
    });
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(29);
    await expect(p.locator("[data-listen-before]")).toBeHidden();
    await p.locator("[data-listen-upcoming]").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(37);
    await p.evaluate(() => {
      (window as any).failPageOnce = true;
    });
    await p.locator("[data-listen-upcoming]").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await expect(p.locator("[data-listen-load-status]")).toHaveText(
      "합성 연결 오류",
    );
    await expect(p.locator("[data-listen-retry]")).toBeVisible();
    await p.locator("[data-listen-retry]").click();
    await expect(p.locator("[data-listen-load-status]")).toHaveText("");
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(17);
    await p.locator("[data-listen-upcoming]").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(25);
    await p.locator("[data-listen-upcoming]").evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(29);
    await expect(p.locator("[data-listen-after]")).toBeHidden();
    await p.locator('[data-memory="synthetic-39.wav"]').click();
    await expect(p.locator("[data-listen-title]")).toHaveText("합성 일기 39");
    await expect(p.locator('[data-memory="synthetic-39.wav"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(p.locator('[data-memory="synthetic-20.wav"]')).toHaveAttribute(
      "aria-current",
      "false",
    );
    expect(
      await p
        .locator("[data-listen-rows] > button")
        .evaluateAll(
          (es) =>
            new Set(es.map((e) => (e as HTMLElement).dataset.memory)).size,
        ),
    ).toBe(29);
    await p.evaluate(() => {
      (window as any).pageDelay = 240;
    });
    await p.locator("[data-listen-upcoming]").evaluate((e) => {
      e.scrollTop = 0;
    });
    await expect(p.locator("[data-listen-upcoming]")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await p.evaluate(() => {
      const w = window as any;
      w.rows = w.rows.slice(0, 4);
      Object.assign(w.state.driving_listen, {
        memory: w.rows[0].id,
        title: w.rows[0].title,
        date: w.rows[0].date,
        index: 0,
        count: 4,
        catalog_version: 2,
        previous: false,
        next: true,
      });
      w.publish();
    });
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(4);
    await expect(p.locator("[data-listen-upcoming]")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await p.waitForTimeout(300); // The superseded delayed reply must not restore the old catalog.
    await expect(p.locator("[data-listen-rows] > button")).toHaveCount(4);

    await expect(
      p.locator("[data-listen-rows] > button").first(),
    ).toHaveAttribute("data-memory", "synthetic-0.wav");
    await expect(
      p.locator("[data-listen-rows] > button").last(),
    ).toHaveAttribute("data-memory", "synthetic-3.wav");
    await p.screenshot({ path: `test-results/c045/driving-list-${theme}.png` });
    await p.evaluate(() => {
      const w = window as any;
      w.state.driving = false;
      w.state.playback.memory = w.state.driving_listen.memory;
      w.state.playback.title = w.state.driving_listen.title;
      w.publish();
      w.restoreNativeView("carhome", null);
    });
    const bar = p.locator(".parked-player");
    await expect(bar).toBeVisible();
    await bar
      .getByRole("button", { name: "일기 일시정지", exact: true })
      .click();
    await expect(
      bar.getByRole("button", { name: "일기 이어 듣기", exact: true }),
    ).toBeVisible();
    await bar.getByRole("button", { name: "다음 일기", exact: true }).click();
    await expect(bar.locator("[data-player-title]")).toHaveText("합성 일기 1");
    await bar
      .getByRole("button", { name: "그날의 목소리", exact: true })
      .click();
    await expect(
      bar.getByRole("button", { name: "원본 이어 듣기", exact: true }),
    ).toBeVisible();
    await expect(bar.locator("[data-player-title]")).toHaveText("합성 일기 1");
    await bar
      .getByRole("button", { name: "원본 이어 듣기", exact: true })
      .click();
    await expect(
      bar.getByRole("button", { name: "원본 일시정지", exact: true }),
    ).toBeVisible();
    await bar.getByRole("button", { name: "이전 일기", exact: true }).click();
    await expect(bar.locator("[data-player-title]")).toHaveText("합성 일기 0");
    await expect(
      bar.getByRole("button", { name: "이전 일기", exact: true }),
    ).toBeDisabled();
    await p.setViewportSize({ width: 1682, height: 1154 });
    for (const route of ["carlist", "carsettings", "carhome"]) {
      await p.evaluate(
        (r) => (window as any).restoreNativeView(r, null),
        route,
      );
      await expect(bar).toBeVisible();
      await expect(
        p.getByRole("button", { name: /일기 \d+편 이어 듣기/ }),
      ).toHaveCount(0);
      const bounds = (await bar.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(1155);
      expect(await p.evaluate(() => document.body.scrollTop)).toBe(0);
    }
    await p.screenshot({
      path: `test-results/c045/parked-player-${theme}.png`,
    });
    await bar.getByRole("button", { name: "재생 종료", exact: true }).click();
    await expect(bar).toHaveCount(0);
    await p.evaluate(() => {
      const w = window as any;
      Object.assign(w.state, {
        driving: true,
        recording: true,
        can_record: false,
        elapsed: 15,
        level: 0.5,
        stt_status: "인식 중",
        stt_text: "숨겨야 하는 전체 인식문",
        driving_transcript: "첫 번째 줄\n두 번째 줄",
      });
      w.publish();
    });
    await p.evaluate(() => document.fonts.ready);
    await expect(p.locator('[data-caption-line="previous"]')).toHaveText(
      "첫 번째 줄",
    );
    await expect(p.locator('[data-caption-line="current"]')).toHaveText(
      "두 번째 줄",
    );
    await expect(
      p.getByText("숨겨야 하는 전체 인식문", { exact: true }),
    ).toHaveCount(0);
    expect(
      await p
        .locator('[data-caption-line="previous"]')
        .evaluate((e) => Number(getComputedStyle(e).opacity)),
    ).toBeLessThan(1);
    await p.evaluate(() => {
      const w = window as any;
      w.state.driving_transcript =
        "첫 번째 줄\n두 번째 줄\n새로 진행 중인 문장";
      w.publish();
    });
    await expect(p.locator('[data-caption-line="previous"]')).toHaveText(
      "두 번째 줄",
    );
    await expect(p.locator('[data-caption-line="current"]')).toHaveText(
      "새로 진행 중인 문장",
    );
    await p.evaluate(() => {
      const w = window as any;
      w.state.driving_transcript = "아주긴합성인식문".repeat(15) + "마지막";
      w.publish();
    });
    await expect(p.locator("[data-caption-line]")).toHaveCount(2);
    await expect(p.locator('[data-caption-line="current"]')).toContainText(
      "마지막",
    );
    await p.evaluate(() => {
      const w = window as any;
      w.state.driving_transcript = "이전 인식 문장\n오늘 가족과 공원에 갔어요";
      w.publish();
    });
    await expect(p.locator('[data-caption-line="current"]')).toHaveText(
      "오늘 가족과 공원에 갔어요",
    );
    await p.screenshot({
      path: `test-results/c045/driving-caption-${theme}.png`,
    });
    await p.evaluate(() => {
      const w = window as any;
      Object.assign(w.state, {
        driving: false,
        stt_text: Array.from(
          { length: 70 },
          (_, i) => `합성 인식 문장 ${i}입니다.`,
        ).join("\n"),
      });
      w.publish();
      w.restoreNativeView("recording", null);
    });
    const transcript = p.locator("[data-live-transcript]");
    await expect(transcript.locator(".recording-line")).toHaveCount(70);
    expect(
      await transcript.evaluate((e) =>
        Math.abs(e.scrollHeight - e.clientHeight - e.scrollTop),
      ),
    ).toBeLessThan(2);
    await transcript.dispatchEvent("wheel", { deltaY: -400 });
    await transcript.evaluate((e) => {
      e.scrollTop = 0;
    });
    await expect(
      p.getByRole("button", { name: "최신 문장으로", exact: true }),
    ).toBeVisible();
    await p.evaluate(() => {
      const w = window as any;
      w.state.stt_text += "\n새로 수신된 마지막 이야기입니다.";
      w.publish();
    });
    await expect(transcript.locator(".recording-line")).toHaveCount(71);
    expect(await transcript.evaluate((e) => e.scrollTop)).toBe(0);
    await p.getByRole("button", { name: "최신 문장으로", exact: true }).click();
    expect(
      await transcript.evaluate((e) =>
        Math.abs(e.scrollHeight - e.clientHeight - e.scrollTop),
      ),
    ).toBeLessThan(2);
    await expect(transcript.locator(".latest")).toHaveText(
      "새로 수신된 마지막 이야기입니다.",
    );
    await p.screenshot({
      path: `test-results/c045/parked-transcript-${theme}.png`,
    });
    await p.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS C045: date cursor ±8/8 pages, ends/duplicate prevention/error retry/current selection, four diaries, common transport/mode/pause, no bulk listen button, explicit/long/partial caption lines, 71 parked sentences with user-controlled following; " +
      (deployed ? "deployed" : "local") +
      " assets, synthetic bridge.",
  );
} finally {
  await browser.close();
}
