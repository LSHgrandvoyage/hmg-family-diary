import { chromium, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
const deployed = process.env.CHAGOK_UI_ORIGIN;
const origin = deployed || "https://c044.test";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
await mkdir("test-results/c044", { recursive: true });
const errors: string[] = [];
async function page(
  native: boolean,
  dark: boolean,
  width = 1280,
  height = 720,
) {
  const p = await browser.newPage({
    ignoreHTTPSErrors: !!deployed,
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(
    ({ native, dark }) => {
      const w = window as any;
      w.__name = (v: any) => v;
      w.EventSource = undefined;
      w.calls = [];
      localStorage.setItem("chagok-theme-v1", dark ? "dark" : "light");
      w.state = {
        driving: true,
        recording: true,
        paused: false,
        can_record: false,
        elapsed: 1122,
        level: 0.6,
        paired: false,
        theme_mode: dark ? "dark" : "light",
        theme_dark: dark,
        stt_text: "노출하지 않을 전체 인식문",
        driving_transcript:
          "오늘 바다에서 모래성을 만들었어. 다음에는 할머니랑 같이 가고 싶어.",
        stt_status: "인식 중",
        driving_listen: { available: false },
        settings: {
          paired: false,
          vehicle: { nickname: "합성 우리 차" },
          server_setup_available: true,
          server_configured: true,
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
            if (r.cmd === "settings") w.openNativeSettings();
            if (r.cmd === "listenAction" && r.action === "listenToggle")
              w.state.playback.playing = !w.state.playback.playing;
            if (r.cmd === "listenAction" && r.action === "listenExit") {
              w.state.playback.active = false;
              w.state.tts_active = false;
              w.state.audio_memory = null;
              w.state.can_record = true;
            }
            if (r.cmd === "driveAction" && r.action === "pause")
              w.state.paused = !w.state.paused;
            if (r.cmd === "listenAction" && r.action === "listenNext")
              w.state.playback.title = "합성 다음 일기";
            setTimeout(() => w.NativeReply(r.id, value), 0);
          },
        };
    },
    { native, dark },
  );
  await p.route(origin + "/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/"))
      return route.fulfill({
        json: path.endsWith("/devices")
          ? { devices: [] }
          : path.endsWith("/sessions")
            ? { items: [] }
            : { vault_id: "synthetic" },
      });
    if (deployed) return route.continue();
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
  return p;
}
async function shot(p: Page, name: string) {
  await p.evaluate(() => document.fonts.ready);
  if (await p.locator("body.vehicle #app > div").count()) {
    await fullArea(p);
    expect(await p.evaluate(() => document.body.scrollTop)).toBe(0);
    for (const element of await p
      .locator(".drive-record-actions button,.parked-player,.settings-rail")
      .all()) {
      const box = (await element.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(
        p.viewportSize()!.height + 1,
      );
    }
  }
  await p.screenshot({ path: `test-results/c044/${name}.png` });
}
async function fullArea(p: Page) {
  await expect
    .poll(async () =>
      Math.round((await p.locator("#app > div").boundingBox())!.width),
    )
    .toBe(p.viewportSize()!.width);
  const bounds = await p.locator("#app > div").boundingBox();
  const size = p.viewportSize()!;
  expect(bounds!.x).toBeCloseTo(0, 0);
  expect(bounds!.y).toBeCloseTo(0, 0);
  expect(bounds!.width).toBeCloseTo(size.width, 0);
  expect(bounds!.height).toBeCloseTo(size.height, 0);
}
try {
  for (const dark of [true, false]) {
    const theme = dark ? "dark" : "light";
    const w = await page(false, dark);
    await w.goto(origin + "/faithful/welcome.html");
    await expect(w.locator("[data-start]")).toBeDisabled();
    await expect(w.locator("[data-consent]:checked")).toHaveCount(0);
    await shot(w, `welcome-initial-${theme}`);
    await w.locator('[data-consent="0"]').check();
    expect(
      await w
        .locator("[data-consent-all]")
        .evaluate((e: HTMLInputElement) => e.indeterminate),
    ).toBe(true);
    await expect(w.locator("[data-start]")).toBeDisabled();
    await w.locator("[data-consent-all]").check();
    await expect(w.locator("[data-consent]:checked")).toHaveCount(3);
    await expect(w.locator("[data-start]")).toBeEnabled();
    await shot(w, `welcome-all-${theme}`);
    await w.locator('[data-consent="1"]').uncheck();
    await expect(w.locator("[data-start]")).toBeDisabled();
    await w.getByRole("button", { name: "보기", exact: true }).click();
    await expect(w.getByRole("dialog")).toBeVisible();
    await expect(w.getByRole("dialog")).toContainText("고정 결과");
    await expect(w.getByRole("dialog")).toContainText(
      "정해진 기간 후 자동 삭제하는 기능은 없습니다",
    );
    await w.getByRole("button", { name: "안내 닫기" }).click();
    await w.evaluate(() => {
      const v = window as any;
      v.updateWelcome({
        checks: [true, true, true],
        ready: true,
        waiting: true,
      });
    });
    await expect(w.locator("[data-start]")).toBeDisabled();
    await expect(w.locator("[data-readiness]")).toContainText("차량 상태");
    await w.setViewportSize({ width: 1682, height: 1154 });
    await shot(w, `welcome-adaptive-${theme}`);
    await w.close();

    const v = await page(true, dark);
    await v.goto(origin + "/faithful/app.html#carhome");
    await expect(v.locator("[data-driving-transcript]")).toHaveText(
      "오늘 바다에서 모래성을 만들었어. 다음에는 할머니랑 같이 가고 싶어.",
    );
    await expect(
      v.getByText("노출하지 않을 전체 인식문", { exact: true }),
    ).toHaveCount(0);
    expect(
      await v
        .locator("[data-driving-transcript]")
        .evaluate((e) =>
          String(
            e.clientHeight <=
              parseFloat(getComputedStyle(e).lineHeight) * 2 + 1,
          ),
        ),
    ).toBe("true");
    await shot(v, `driving-caption-${theme}`);
    await v.evaluate(() => {
      const w = window as any;
      w.state.driving_transcript =
        "앞에서 나눈 합성 이야기입니다. ".repeat(8) +
        "가장 최근에 인식된 문장입니다.";
      w.nativeStatus(w.state);
    });
    await expect
      .poll(() =>
        v
          .locator("[data-driving-transcript]")
          .evaluate((e) =>
            Math.abs(e.scrollHeight - e.clientHeight - e.scrollTop),
          ),
      )
      .toBeLessThanOrEqual(1);
    await expect(v.locator("[data-driving-transcript]")).toContainText(
      "가장 최근에 인식된 문장입니다.",
    );

    await v.getByRole("button", { name: "잠깐 멈춤", exact: true }).click();
    await expect(v.locator("[data-drive-stt-status]")).toHaveText(
      "음성 인식 일시정지",
    );
    await v.getByRole("button", { name: "이어서 녹음", exact: true }).click();
    await v.setViewportSize({ width: 1682, height: 1154 });
    await fullArea(v);
    await shot(v, `driving-adaptive-${theme}`);
    await v.evaluate(() => {
      const w = window as any;
      Object.assign(w.state, {
        driving: false,
        recording: false,
        playback: {
          active: true,
          memory: "synthetic.wav",
          mode: "original",
          title: "합성 바다 나들이",
          position: 42,
          duration: 120,
          playing: true,
        },
        driving_listen: {
          memory: "synthetic.wav",
          previous: false,
          next: true,
        },
        audio_memory: "synthetic.wav",
      });
      w.nativeStatus(w.state);
      w.restoreNativeView("carhome", null);
    });
    await expect(v.locator(".parked-player")).toBeVisible();
    await fullArea(v);
    await expect(v.locator("[data-player-mode]")).toHaveText(
      "그날의 목소리 · 재생 중",
    );
    await expect(v.locator("[data-player-time]")).toHaveText("0:42 / 2:00");
    await expect(v.locator("[data-record-start]")).toBeDisabled();
    await v.getByRole("button", { name: "원본 일시정지", exact: true }).click();
    await expect(
      v.getByRole("button", { name: "원본 이어 듣기", exact: true }),
    ).toBeVisible();
    await v
      .getByRole("button", { name: "원본 이어 듣기", exact: true })
      .click();
    for (const route of ["carlist", "carsettings", "carhome"]) {
      await v.evaluate((r) => {
        (window as any).restoreNativeView(r, null);
      }, route);
      await expect(v.locator(`[data-page="${route}"]`)).toBeVisible();
      await expect(v.locator(".parked-player")).toBeVisible();
      const content = await v
          .locator("#app > div > :nth-child(2)")
          .boundingBox(),
        bar = await v.locator(".parked-player").boundingBox();
      expect(content!.y + content!.height).toBeLessThanOrEqual(bar!.y);
    }
    expect(
      await v.evaluate(() =>
        (window as any).calls.some((c: any) => c.cmd === "stopPlayback"),
      ),
    ).toBe(false);
    await shot(v, `parked-original-${theme}`);
    await v.getByRole("button", { name: "재생 종료", exact: true }).click();
    await expect(v.locator(".parked-player")).toHaveCount(0);
    await expect(v.locator("[data-record-start]")).toBeEnabled();
    await v.evaluate(() => {
      const w = window as any;
      Object.assign(w.state, {
        tts_active: true,
        can_record: false,
        tts_count: 3,
        tts_index: 0,
        tts_next: true,
        playback: {
          active: true,
          memory: "synthetic.wav",
          mode: "diary",
          title: "합성 가족의 하루",
          position: 12,
          playing: true,
        },
      });
      w.nativeStatus(w.state);
    });
    await expect(v.locator("[data-player-mode]")).toHaveText(
      "일기 읽어주기 · 재생 중",
    );
    await expect(
      v.locator('[data-player-command="listenToggle"]'),
    ).toBeVisible();
    await v.getByRole("button", { name: "다음 일기", exact: true }).click();
    await expect(v.locator("[data-player-title]")).toHaveText("합성 다음 일기");
    await shot(v, `parked-tts-${theme}`);
    await v.getByRole("button", { name: "재생 종료", exact: true }).click();
    await expect(v.locator(".parked-player")).toHaveCount(0);
    await v.close();

    const m = await page(false, dark, 375, 812);
    await m.goto(origin + "/faithful/app.html#main");
    await m.getByText("가족", { exact: true }).click();
    await expect(m.getByRole("dialog")).toBeVisible();
    await expect(
      m.getByRole("dialog").getByText("연결 차량 관리", { exact: true }),
    ).toHaveCount(0);
    await expect(
      m.getByRole("button", { name: "로그아웃", exact: true }),
    ).toBeVisible();
    await shot(m, `mobile-family-${theme}`);
    await m.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS C044 both themes: consent unset/partial/all/revoke/UNKNOWN, readable prototype notice, real caption-only feed, pause, adaptive1682×1154 no letterbox, D→P persistent original/TTS controls on home/list/settings, reserved player space, navigation does not stop audio, no duplicate family link. Synthetic browser bridge/API; " +
      (deployed ? "deployed" : "local") +
      " assets.",
  );
} finally {
  await browser.close();
}
