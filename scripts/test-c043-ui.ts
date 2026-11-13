import { chromium, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
const deployed = process.env.CHAGOK_UI_ORIGIN;
const origin = deployed || "https://c043.test";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
await mkdir("test-results/c043", { recursive: true });
const connectedDevice = {
  id: "synthetic-car",
  label: "합성 우리 차",
  expires_at: "2099-12-31T00:00:00Z",
  revoked_at: null,
};
const syntheticRecord = {
  id: "synthetic.wav",
  saved: true,
  photos: [],
  snapshot: {
    recorded_at: "2099-11-13T00:00:00Z",
    text: "합성 테스트 문장",
    speaker: "합성 화자",
    duration_ms: 120000,
    draft: JSON.stringify({
      groups: [
        { label: "합성 일기", statements: [{ text: "합성 테스트 문장" }] },
      ],
    }),
  },
};
const errors: string[] = [];
async function setup(native: boolean, dark: boolean, width = 375) {
  const p = await browser.newPage({
    ignoreHTTPSErrors: !!deployed,
    reducedMotion: "reduce",
    viewport: native ? { width: 1280, height: 720 } : { width, height: 812 },
  });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(
    ({ native, dark }) => {
      const w = window as any;
      w.__name = (v: any) => v;
      w.calls = [];
      w.EventSource = undefined;
      localStorage.setItem("chagok-theme-v1", dark ? "dark" : "light");
      w.state = {
        driving: true,
        recording: false,
        can_record: true,
        paired: true,
        theme_mode: dark ? "dark" : "light",
        theme_dark: dark,
        driving_listen: {
          mode: "diary",
          available: true,
          memory: "synthetic.wav",
          title: "바다를 보러 간 날,\n돌아오는 길의 수다",
          date: "5월 14일 수요일",
          index: 0,
          count: 3,
          previous: false,
          next: true,
          duration_ms: 480000,
          elapsed: 132,
          upcoming: [
            {
              day: "10",
              title: "할머니 집에 다녀온 토요일",
              date: "5월 · 토요일",
            },
            {
              day: "03",
              title: "조금 늦은 저녁 드라이브",
              date: "5월 · 토요일",
            },
          ],
        },
      };
      if (native)
        w.NativeDiary = {
          theme: () => JSON.stringify(w.state),
          invoke: (raw: string) => {
            const r = JSON.parse(raw);
            w.calls.push(r);
            let value = w.state;
            if (r.cmd === "list") value = { items: [] };
            if (r.cmd === "driveAction") {
              const s = w.state;
              if (r.action === "record")
                Object.assign(s, {
                  recording: true,
                  can_record: false,
                  elapsed: 1122,
                  level: 0.8,
                });
              if (r.action === "pause") s.paused = !s.paused;
              if (r.action === "finish")
                Object.assign(s, {
                  recording: false,
                  paused: false,
                  stt_busy: true,
                  can_record: false,
                });
              if (r.action === "listenToggle") {
                if (s.driving_listen.mode === "diary")
                  s.tts_active = !s.tts_active;
                else {
                  s.playing = !s.playing;
                  s.audio_memory = "synthetic.wav";
                }
              }
              if (r.action === "listenOriginal") {
                s.driving_listen.mode = "original";
                s.tts_active = false;
                s.playing = true;
                s.audio_memory = "synthetic.wav";
                s.position = 132;
              }
              if (r.action === "listenDiary") {
                s.driving_listen.mode = "diary";
                s.tts_active = true;
                s.playing = false;
                s.audio_memory = null;
              }
              if (r.action === "listenExit")
                Object.assign(s, {
                  tts_active: false,
                  playing: false,
                  audio_memory: null,
                  can_record: true,
                });
              if (r.action === "listenNext") {
                s.driving_listen.index = 1;
                s.driving_listen.title = "할머니 집에 다녀온 토요일";
                s.driving_listen.previous = true;
              }
            }
            setTimeout(() => w.NativeReply(r.id, value), 0);
          },
        };
    },
    { native, dark },
  );
  return p;
}
async function staticRoute(p: Page, api: (path: string) => any) {
  await p.route(origin + "/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/")) {
      await route.fulfill({ json: api(path) });
      return;
    }
    if (deployed) return route.continue();
    try {
      await route.fulfill({
        body: await readFile(join("apps/web/public", path)),
        contentType:
          (
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".svg": "image/svg+xml",
              ".woff2": "font/woff2",
            } as any
          )[extname(path)] || "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}
async function snapshot(p: Page, name: string) {
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `test-results/c043/${name}.png` });
}
try {
  for (const dark of [true, false]) {
    const p = await setup(false, dark);
    let paired = true,
      records = false,
      expiry = 300000;
    await staticRoute(p, (path) =>
      path.endsWith("/devices")
        ? { devices: paired ? [connectedDevice] : [] }
        : path.endsWith("/pairings")
          ? {
              code: "012345",
              expires_at: new Date(Date.now() + expiry).toISOString(),
            }
          : path.endsWith("/sessions")
            ? { items: records ? [syntheticRecord] : [] }
            : path.endsWith("/sync")
              ? { items: [], cursor: "0", has_more: false }
              : { vault_id: "synthetic" },
    );
    await p.goto(origin + "/faithful/app.html#main");
    await expect(p.locator(".mobile-library-header a")).toHaveText(/연결됨/);
    const theme = p.locator(".theme-shortcut button");
    await expect(theme).toBeVisible();
    expect(
      await theme.evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    expect((await theme.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect((await theme.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const themeBefore = await theme.getAttribute("aria-label");
    await theme.click();
    await expect(theme).not.toHaveAttribute("aria-label", themeBefore!);
    await theme.click();
    await snapshot(p, `mobile-home-${dark ? "dark" : "light"}`);
    await p.locator(".mobile-library-header a").click();
    await expect(
      p.getByText("차량과 연결됐어요", { exact: true }),
    ).toBeVisible();
    await expect(p.locator(".pairing-code-digits")).toHaveCount(0);
    await expect(p.getByText("보관함으로", { exact: true })).toHaveCount(0);
    await expect(
      p.getByRole("button", { name: "연결 차량 관리", exact: true }),
    ).toBeVisible();
    await snapshot(p, `mobile-connected-${dark ? "dark" : "light"}`);
    // Revoke while retaining history: online reconciliation must update the header.
    paired = false;
    records = true;
    await p.goto(origin + "/faithful/app.html#main");
    await expect(p.locator(".mobile-library-header a")).toHaveText(
      /차량 연결하기/,
    );
    paired = true;
    await p.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(p.locator(".mobile-library-header a")).toHaveText(/연결됨/);
    paired = false;
    await p.locator(".mobile-library-header a").click();
    await expect(
      p.getByRole("list", { name: "차량 연결 순서" }).locator("li"),
    ).toHaveCount(3);
    await expect(p.locator('[aria-current="step"] strong')).toHaveText(
      "휴대폰에서 코드 만들기",
    );
    await p
      .getByRole("button", { name: "차량 연결 코드 만들기", exact: true })
      .click();
    await expect(p.locator(".pairing-code-digits > span")).toHaveText([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    await expect(p.locator('[aria-current="step"] strong')).toHaveText(
      "차량에 코드 입력하기",
    );
    await snapshot(p, `mobile-steps-${dark ? "dark" : "light"}`);
    await p.setViewportSize({ width: 320, height: 568 });
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      p.getByRole("button", { name: "새 연결 코드 만들기", exact: true }),
    ).toBeVisible();
    expiry = 100;
    await p
      .getByRole("button", { name: "새 연결 코드 만들기", exact: true })
      .click();
    await expect(
      p.getByText("코드가 만료됐어요. 새로 만들어 주세요.", { exact: true }),
    ).toBeVisible();
    await expect(p.locator(".pairing-code-digits > span")).toHaveText([
      "–",
      "–",
      "–",
      "–",
      "–",
      "–",
    ]);
    await p.close();

    const v = await setup(true, dark);
    await staticRoute(v, () => ({}));
    await v.goto(origin + "/faithful/app.html#carhome");
    await expect(v.locator('[data-drive-stage="idle"]')).toBeVisible();
    await expect(v.locator("nav")).toHaveCount(0);
    await expect(
      v.locator("[data-live-transcript],[data-review-text],.photo-gallery"),
    ).toHaveCount(0);
    await snapshot(v, `driving-idle-${dark ? "dark" : "light"}`);
    await v.getByRole("button", { name: /일기 듣기/ }).click();
    await expect(v.locator('[data-drive-stage="listening"]')).toBeVisible();
    await expect(v.locator("[data-listen-progress]")).toBeHidden(); // SDK has no TTS duration.
    await expect(v.locator("[data-listen-position]")).toHaveText("2:12");
    await expect(v.locator("[data-listen-duration]")).toHaveText("낭독 중");
    await expect(v.locator(".drive-upcoming-card")).toHaveCount(2);
    const playBounds = await v
      .locator('[data-drive="listenToggle"]')
      .boundingBox();
    expect(playBounds!.width).toBe(160);
    expect(playBounds!.height).toBe(160);
    await snapshot(v, `driving-listening-${dark ? "dark" : "light"}`);
    await v
      .getByRole("button", {
        name: "같은 일기의 원본 듣기로 전환",
        exact: true,
      })
      .click();
    await expect(v.locator("[data-listen-progress]")).toBeVisible();
    await expect(v.locator("[data-listen-progress]")).toHaveAttribute(
      "aria-valuenow",
      "132",
    );
    expect(
      await v
        .locator("[data-listen-progress] span")
        .evaluate((e) => (e as HTMLElement).style.width),
    ).toBe("27.5%");
    expect(
      await v.evaluate(() => (window as any).state.driving_listen.memory),
    ).toBe("synthetic.wav");
    await snapshot(v, `driving-original-${dark ? "dark" : "light"}`);
    await v.getByRole("button", { name: "원본 일시정지", exact: true }).click();
    await expect(
      v.getByRole("button", { name: "원본 재생", exact: true }),
    ).toBeVisible();
    await v
      .getByRole("button", {
        name: "같은 일기의 일기 듣기로 전환",
        exact: true,
      })
      .click();
    await v.getByRole("button", { name: "다음 일기", exact: true }).click();
    await expect(v.locator("[data-listen-title]")).toHaveText(
      "할머니 집에 다녀온 토요일",
    );
    await v.getByRole("button", { name: "녹음하러 가기", exact: true }).click();
    await expect(v.locator('[data-drive-stage="idle"]')).toBeVisible();
    expect(
      await v.evaluate(
        () =>
          (window as any).calls.filter((c: any) => c.action === "record")
            .length,
      ),
    ).toBe(0);
    await v.getByRole("button", { name: "녹음 시작", exact: true }).click();
    await expect(v.locator("[data-timer]")).toHaveText("18:42");
    await expect(v.locator(".drive-record-actions button")).toHaveCount(2);
    await expect(v.getByText("이 순간 표시", { exact: true })).toHaveCount(0);
    await v.evaluate(() => {
      const w = window as any;
      for (let i = 0; i < 16; i++)
        w.nativeStatus({
          ...w.state,
          level: ((i % 5) + 1) / 5,
          stt_text: "숨겨야 하는 합성 인식문",
        });
    });
    await expect(
      v.getByText("숨겨야 하는 합성 인식문", { exact: true }),
    ).toHaveCount(0);
    expect(
      await v
        .locator("[data-input-wave] span")
        .evaluateAll((nodes) =>
          nodes.some((n) => parseFloat((n as HTMLElement).style.height) > 10),
        ),
    ).toBe(true);
    await snapshot(v, `driving-recording-${dark ? "dark" : "light"}`);
    await v.getByRole("button", { name: "잠깐 멈춤", exact: true }).click();
    await expect(v.locator("[data-record-state]")).toHaveText(
      "멈춤 · 녹음되지 않는 중",
    );
    expect(
      await v
        .locator("[data-input-wave] span")
        .evaluateAll((nodes) =>
          nodes.every((n) => (n as HTMLElement).style.height === "4px"),
        ),
    ).toBe(true);
    await snapshot(v, `driving-paused-${dark ? "dark" : "light"}`);
    await v.getByRole("button", { name: "이어서 녹음", exact: true }).click();
    await expect(
      v.getByRole("button", { name: "잠깐 멈춤", exact: true }),
    ).toBeVisible();
    await v.getByRole("button", { name: "녹음 마치기", exact: true }).click();
    await expect(v.locator('[data-drive-stage="idle"]')).toBeVisible();
    await expect(v.locator("[data-driving-status]")).toHaveText(/주차 후/);
    await v.evaluate(() => {
      const w = window as any;
      w.state.stt_busy = false;
      w.state.can_record = true;
      w.state.driving_listen = { available: false, count: 0 };
      w.nativeStatus(w.state);
    });
    await expect(v.getByRole("button", { name: /일기 듣기/ })).toBeDisabled();
    expect(
      await v.evaluate(() =>
        (window as any).calls.some((r: any) =>
          ["list", "read", "createDiary"].includes(r.cmd),
        ),
      ),
    ).toBe(false);
    expect(
      await v.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await v.evaluate(() => {
      const w = window as any;
      w.state.driving = false;
      w.nativeStatus(w.state);
      w.restoreNativeView("carhome", null);
    });
    await expect(v.locator('[data-page="carhome"]')).toBeVisible();
    await expect(v.locator("[data-review-text]")).toHaveCount(0);
    expect(
      await v.evaluate(
        () => (window as any).calls.filter((r: any) => r.cmd === "list").length,
      ),
    ).toBe(1);
    await v.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS C043: mobile connected/unpaired/history/online reconciliation, 6 leading-zero digits, expiry, icon-only theme, narrow screen; four driving states, waveform/pause, same-record audio switch, true original progress, no fabricated TTS progress, exit stops without recording, restricted driving bridge, both themes. Synthetic data/bridge; " +
      (deployed ? "deployed" : "local") +
      " static assets.",
  );
} finally {
  await browser.close();
}
