import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const fixture = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const photo = await readFile(".tools/runtime/qa-photo.png");
const base = "https://diary-ui.test";
const record = () => ({
  id: fixture.id,
  revision: 1,
  audio_ready: true,
  shared: false,
  linked: false,
  photos: [1, 2, 3, 4].map((n) => ({ id: `photo-${n}` })),
  snapshot: {
    ...fixture.snapshot,
    recorded_at: "2099-11-08T04:00:00Z",
    speaker: "합성 가족",
    text: "합성 사진과 파형 검사예요.",
    draft: JSON.stringify({
      groups: [
        {
          label: "합성 가족의 기록",
          statements: [{ text: "합성 사진과 파형 검사예요." }],
        },
      ],
    }),
  },
});
await mkdir("docs/evidence/connected-ui", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  let m = record(),
    deleted = 0,
    failDelete = false;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route(base + "/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path.startsWith("/faithful/")) {
      const file = path.slice("/faithful/".length);
      if (file.includes("..")) return route.abort();
      const type = (
        {
          ".js": "text/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".woff2": "font/woff2",
        } as Record<string, string>
      )[extname(file)];
      return route.fulfill({
        body: await readFile(join("apps/web/public/faithful", file)),
        contentType: type,
      });
    }
    if (path.includes("/photos/")) {
      if (route.request().method() === "DELETE") {
        if (failDelete)
          return route.fulfill({
            status: 503,
            json: { error: { message: "합성 서버 오류" } },
          });
        deleted++;
        m.photos = m.photos.filter((p) => !path.endsWith(p.id));
        return route.fulfill({ json: {} });
      }
      return route.fulfill({ body: photo, contentType: "image/png" });
    }
    if (path.endsWith("/sessions"))
      return route.fulfill({ json: { items: [m] } });
    if (path.endsWith(m.id)) return route.fulfill({ json: m });
    return route.fulfill({ json: { devices: [] } });
  });
  await page.goto(base + "/faithful/app.html#detail?id=" + m.id);
  await expect(
    page.getByRole("button", { name: "사진 4 크게 보기" }),
  ).toBeAttached();
  await expect(page.getByText(/기억에 남는 한마디/)).toHaveCount(0);
  const addPhoto = page.getByRole("button", { name: "사진 추가", exact: true });
  await expect(addPhoto).toBeVisible();
  const beforeAdd = await addPhoto.boundingBox();
  await page
    .locator(".photo-strip")
    .evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await expect(addPhoto).toBeVisible();
  expect(await addPhoto.boundingBox()).toEqual(beforeAdd);
  await page.locator(".photo-strip").evaluate((el) => (el.scrollLeft = 0));
  await page.getByRole("button", { name: "사진 1 크게 보기" }).click();
  const viewer = page.getByRole("dialog", { name: "사진 크게 보기" });
  await expect(viewer.getByText("1 / 4", { exact: true })).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "사진 삭제", exact: true }),
  ).toBeHidden();
  // Send real touch gestures through this isolated headless target, never the user's browser.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 320, y: 400 }],
  });
  for (const x of [280, 220, 160, 100, 45])
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: 400 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(viewer.getByText("2 / 4", { exact: true })).toBeVisible();
  await viewer.getByRole("button", { name: "다음 사진", exact: true }).click();
  await expect(viewer.getByText("3 / 4", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("2 / 4", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/connected-ui/swipe-photo-viewer.png",
  });
  await viewer.getByRole("button", { name: "사진 옵션" }).click();
  await viewer.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(deleted).toBe(0);
  failDelete = true;
  await viewer.getByRole("button", { name: "사진 옵션" }).click();
  await viewer.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByText("합성 서버 오류", { exact: true })).toBeVisible();
  expect(m.photos.length).toBe(4);
  await page.getByRole("button", { name: "확인", exact: true }).click();
  failDelete = false;
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(viewer).toHaveCount(0);
  expect(deleted).toBe(1);
  expect(m.photos.some((p) => p.id === "photo-2")).toBe(false);
  await expect(page.locator(".photo-strip > [role=button]")).toHaveCount(3);
  await page.screenshot({
    path: "docs/evidence/connected-ui/swipe-photo-strip.png",
    fullPage: true,
  });
  await context.close();

  const car = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });
  await car.route(base + "/faithful/**", async (route) => {
    const file = new URL(route.request().url()).pathname.slice(
      "/faithful/".length,
    );
    return route.fulfill({
      body: await readFile(join("apps/web/public/faithful", file)),
      contentType: (
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".woff2": "font/woff2",
        } as Record<string, string>
      )[extname(file)],
    });
  });
  await car.addInitScript(
    ({ memory }) => {
      const w = window as any;
      w.__state = { recording: false, paused: false, level: 0, paired: true };
      w.__records = [memory];
      w.__deleted = 0;
      w.NativeDiary = {
        invoke(raw: string) {
          const r = JSON.parse(raw);
          let result: any = {};
          if (r.cmd === "state") result = w.__state;
          if (r.cmd === "list") result = { items: w.__records };
          if (r.cmd === "read")
            result = w.__records.find((m: any) => m.id === r.memoryId);
          if (r.cmd === "createDiary") {
            if (w.__failCreate) result = { error: "합성 생성 실패" };
            else {
              const m = w.__records[0];
              m.snapshot.text = r.text;
              m.snapshot.speaker = r.speaker;
              m.revision++;
              m.draft_current = true;
              m.snapshot.draft = JSON.stringify({
                groups: [
                  { label: "확인한 합성 일기", statements: [{ text: r.text }] },
                ],
              });
              result = m;
            }
          }
          if (r.cmd === "saveDiary") {
            w.__records[0].saved = true;
            result = w.__records[0];
          }
          if (r.cmd === "delete") {
            w.__records = [];
            w.__deleted++;
            result = { deleted: true };
          }
          setTimeout(
            () => w.NativeReply(r.id, JSON.parse(JSON.stringify(result))),
            0,
          );
        },
      };
    },
    { memory: { ...record(), photos: [] } },
  );
  const cp = await car.newPage();
  cp.setDefaultTimeout(8000);
  cp.on("pageerror", (e) => errors.push(e.message));
  await cp.goto(base + "/faithful/app.html#carhome");
  await expect(cp.getByText("모든 일기 보기", { exact: true })).toHaveCount(0);
  await cp.goto(base + "/faithful/app.html#carlist");
  await expect(
    cp.getByText("오늘의 일기 녹음하기", { exact: true }),
  ).toHaveCount(0);
  await expect(cp.getByText("차량에만 저장", { exact: true })).toBeVisible();
  await cp.screenshot({
    path: "docs/evidence/connected-ui/c015-vehicle-list.png",
  });
  await cp.getByRole("button", { name: "합성 가족의 기록 옵션" }).click();
  await cp.getByRole("button", { name: "일기 삭제", exact: true }).click();
  await cp.getByRole("button", { name: "취소", exact: true }).click();
  expect(await cp.evaluate(() => (window as any).__deleted)).toBe(0);
  await cp.getByRole("button", { name: "일기 삭제", exact: true }).click();
  await cp.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    cp.getByText("아직 남긴 일기가 없어요", { exact: true }),
  ).toBeVisible();
  expect(await cp.evaluate(() => (window as any).__deleted)).toBe(1);
  await cp.evaluate(() => {
    const w = window as any;
    w.__state = { recording: true, paused: false, level: 0, elapsed: 2 };
    location.hash = "recording";
  });
  await expect(cp.locator("[data-input-wave] > span")).toHaveCount(20);
  const heights = () =>
    cp
      .locator("[data-input-wave] > span")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).style.height),
      );
  expect((await heights()).every((x) => x === "4px")).toBe(true);
  await cp.evaluate(() => {
    const w = window as any;
    [0.2, 0.5, 0.8, 1, 0.5, 0.3].forEach((level) => {
      w.__state.level = level;
      w.nativeStatus({ ...w.__state });
    });
  });
  expect((await heights()).some((x) => parseFloat(x) > 40)).toBe(true);
  await cp.screenshot({
    path: "docs/evidence/connected-ui/input-responsive-wave.png",
  });
  await cp.evaluate(() => {
    const w = window as any;
    w.__state.paused = true;
    w.nativeStatus({ ...w.__state });
  });
  await expect(cp.getByText("이어서 녹음", { exact: true })).toBeVisible();
  expect((await heights()).every((x) => x === "4px")).toBe(true);
  await cp.evaluate(
    ({ memory }) => {
      const w = window as any;
      w.__state = {
        recording: false,
        stt_busy: true,
        stt_text: "인식 중인 합성 이야기",
        stt_memory: memory.id,
      };
      w.__records = [
        {
          ...memory,
          saved: false,
          draft_current: false,
          snapshot: {
            ...memory.snapshot,
            text: "",
            draft: JSON.stringify({ groups: [] }),
          },
        },
      ];
      location.hash = "carreview?id=" + memory.id;
    },
    { memory: record() },
  );
  const text = cp.locator("[data-review-text]");
  await expect(text).toHaveValue("인식 중인 합성 이야기");
  await expect(text).toBeDisabled();
  await cp.evaluate(() => {
    const w = window as any;
    w.__state.stt_busy = false;
    w.nativeStatus({ ...w.__state });
  });
  await expect(text).toBeEnabled();
  await text.fill("잘못 들은 말을 수정한 합성 이야기");
  await cp.evaluate(() => ((window as any).__failCreate = true));
  await cp.getByRole("button", { name: "일기로 만들기", exact: true }).click();
  await expect(cp.getByText("합성 생성 실패", { exact: true })).toBeVisible();
  await cp.getByRole("button", { name: "확인", exact: true }).click();
  await expect(text).toHaveValue("잘못 들은 말을 수정한 합성 이야기");
  await cp.evaluate(() => ((window as any).__failCreate = false));
  await cp.getByRole("button", { name: "일기로 만들기", exact: true }).click();
  await expect(
    cp.getByRole("button", { name: "일기 저장", exact: true }),
  ).toBeVisible();
  await expect(text).toHaveValue("잘못 들은 말을 수정한 합성 이야기");
  await cp.screenshot({
    path: "docs/evidence/connected-ui/c016-review-preview.png",
  });
  await cp.getByRole("button", { name: "일기 저장", exact: true }).click();
  await expect(cp.locator("h1")).toHaveText("확인한 합성 일기");
  expect(await cp.evaluate(() => (window as any).__records[0].saved)).toBe(
    true,
  );
  // C017: completed recognition copy, actual original playback progress and selected-only borders.
  await cp.evaluate(() => {
    const w = window as any;
    const m = w.__records[0];
    m.waveform = Array.from({ length: 128 }, (_, i) => (i < 64 ? 0.05 : 0.5));
    m.photos = [{ id: "one", url: "data:image/png;base64," }];
    w.__records.push({ ...m, id: "synthetic-second.wav", photos: [] });
    w.refreshNative();
  });
  await expect(cp.getByText("사진이 없어요", { exact: true })).toHaveCount(0);
  await expect(cp.locator("[data-wave-bar]")).toHaveCount(32);
  await cp.evaluate(() => {
    const w = window as any;
    w.__state = {
      ...w.__state,
      position: w.__records[0].snapshot.duration_ms / 2000,
      playing: false,
    };
    w.nativeStatus(w.__state);
  });
  expect(await cp.locator('[data-wave-bar][data-played="1.000"]').count()).toBe(
    16,
  );
  const quiet = await cp
    .locator("[data-wave-bar]")
    .nth(0)
    .evaluate((n) => parseFloat((n as HTMLElement).style.height));
  const loud = await cp
    .locator("[data-wave-bar]")
    .nth(31)
    .evaluate((n) => parseFloat((n as HTMLElement).style.height));
  expect(loud).toBeGreaterThan(quiet);
  await cp.evaluate(() => {
    const w = window as any;
    w.__state.position = 0;
    w.nativeStatus(w.__state);
  });
  expect(await cp.locator('[data-wave-bar][data-played="1.000"]').count()).toBe(
    0,
  );
  await cp.evaluate(() => {
    location.hash = "carlist";
  });
  await expect(cp.locator('.memory-card[aria-current="true"]')).toHaveCount(1);
  await expect(cp.locator('.memory-card[aria-current="false"]')).toHaveCSS(
    "border-color",
    "rgba(0, 0, 0, 0)",
  );
  await cp.evaluate(() => {
    const w = window as any;
    w.__state.stt_status = "STT 최종결과 수신 8개 구간";
    location.hash = "carreview?id=" + w.__records[0].id;
  });
  await expect(cp.getByText("문장 수정", { exact: true })).toBeVisible();
  await expect(cp.locator("[data-review-status]")).toBeHidden();
  await expect(cp.getByRole("button", { name: "원본 다시 인식" })).toBeHidden();
  await expect(
    cp.getByText(/확인한 텍스트를 맥북|흐름을 시험하고/),
  ).toHaveCount(0);
  await cp.evaluate(() => {
    const w = window as any;
    w.__state.stt_memory = w.__records[0].id;
    w.__state.stt_status = "인식 실패";
    w.nativeStatus(w.__state);
  });
  await expect(
    cp.getByRole("button", { name: "원본 다시 인식" }),
  ).toBeVisible();
  await cp.screenshot({ path: "docs/evidence/connected-ui/c017-review.png" });
  expect(errors).toEqual([]);
  console.log(
    "PASS C015/C016 fixed photo action and review/generate/failure/retry/save; real touch swipe/keyboard/gallery menu/cancel/failure/retry; car menu/delete; input-level waveform/silence/pause; removed duplicate UI.",
  );
} finally {
  await browser.close();
}
