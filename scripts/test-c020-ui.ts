import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const fixture = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const record = {
  id: fixture.id,
  snapshot: fixture.snapshot,
  photos: [],
  audio_ready: true,
  revision: 1,
};
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let polls = 0;
  await p.addInitScript({
    content: `
    window.events=[];
    window.EventSource=class {
      constructor(){this.listeners={};window.events.push(this)}
      addEventListener(name,fn){this.listeners[name]=fn}
      close(){}
    };
  `,
  });
  await p.route("https://diary-c020.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/sync") {
      polls++;
      await route.fulfill({
        json: { items: [], cursor: "7", has_more: false },
      });
      return;
    }
    if (url.pathname === "/api/v1/sessions") {
      await route.fulfill({ json: { items: [record] } });
      return;
    }
    if (url.pathname.startsWith("/api/v1/")) {
      await route.fulfill({ json: record });
      return;
    }
    const name = url.pathname.replace(/^\//, "");
    try {
      await route.fulfill({
        body: await readFile(join("apps/web/public", name)),
        contentType:
          (
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".woff2": "font/woff2",
            } as any
          )[extname(name)] || "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await p.goto("https://diary-c020.test/faithful/app.html#main");
  await p.waitForFunction(() => (window as any).events.length === 1);
  await p.evaluate(() => (window as any).events[0].listeners.ready());
  await expect.poll(() => polls).toBe(1);
  await p.clock.install();
  await p.clock.runFor(120000);
  expect(polls).toBe(1);
  await p.evaluate(() => (window as any).events[0].onerror());
  await p.clock.runFor(50000);
  expect(polls).toBe(1);
  await p.evaluate(() => (window as any).events.at(-1).listeners.ready());
  await expect.poll(() => polls).toBe(2);
  await p.evaluate(() => (window as any).events.at(-1).listeners.changed());
  await expect.poll(() => polls).toBe(3);
  await p.close();
  const car = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });
  await car.addInitScript(() => {
    const w = window as any;
    w.state = {
      recording: true,
      paused: false,
      elapsed: 1122,
      level: 0,
      stt_text:
        "합성 가족이 차 안에서 오늘을 이야기했어요. 창밖 풍경이 아름다워서 오래 기억하고 싶었어요. 돌아가는 길에도 이야기는 계속됐어요. 이 목소리를 나중에도 다시 듣고 싶어요.",
      stt_status: "녹음과 함께 글로 옮기고 있어요",
    };
    w.NativeDiary = {
      invoke(raw: string) {
        const r = JSON.parse(raw);
        setTimeout(
          () => w.NativeReply(r.id, r.cmd === "state" ? w.state : {}),
          0,
        );
      },
    };
  });
  await car.route("https://diary-c020.test/**", async (route) => {
    const name = new URL(route.request().url()).pathname.replace(/^\//, "");
    try {
      await route.fulfill({
        body: await readFile(join("apps/web/public", name)),
        contentType:
          (
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".woff2": "font/woff2",
            } as any
          )[extname(name)] || "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await car.goto("https://diary-c020.test/faithful/app.html#recording");
  await expect(car.locator("[data-timer]")).toHaveText("18:42");
  await expect(car.locator(".recording-line")).toHaveCount(4);
  await expect(car.locator(".recording-line.latest p")).toHaveCSS(
    "font-size",
    "30px",
  );
  const box = await car.locator(".recording-story").boundingBox();
  expect(box!.x).toBe(660);
  expect(box!.width).toBe(572);
  expect(box!.height).toBe(640);
  await expect(
    car.getByText("끝내고 일기 만들기", { exact: true }),
  ).toBeVisible();
  await expect(car.getByText("서아", { exact: true })).toHaveCount(0);
  await car.evaluate(() => {
    const w = window as any;
    [
      0.2, 0.5, 0.8, 0.4, 0.2, 0.8, 0.9, 0.7, 0.2, 0.5, 0.6, 0.9, 0.8, 0.4, 0.5,
      0.8, 0.9, 0.5, 0.2, 0.4,
    ].forEach((level) => w.nativeStatus({ ...w.state, level }));
  });
  await car.screenshot({
    path: "docs/evidence/connected-ui/c020-recording.png",
  });
  expect(await car.locator("[data-input-wave] > span").count()).toBe(20);
  console.log(
    "PASS C020 supplied recording geometry/live text, dynamic waveform, SSE hints/cursor reads, 120s idle no polling, failed stream no fallback polling.",
  );
} finally {
  await browser.close();
}
