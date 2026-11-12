import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const records = ["첫차", "새차", "첫차"].map((nickname, index) => ({
  id: `synthetic-${index}.wav`,
  revision: 1,
  saved: true,
  audio_ready: true,
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
        w.EventSource = undefined;
        if (native) {
          w.state = { paired: true, sync_pending: true };
          w.NativeDiary = {
            invoke(raw: string) {
              const r = JSON.parse(raw);
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
    await p.getByRole("button", { name: "검색", exact: true }).click();
    const filter = p.getByLabel("기록 당시 차량 필터");
    await expect(filter).toBeVisible();
    await expect(filter.locator("option")).toHaveCount(3);
    await filter.selectOption({ label: "첫차 · 합성 · 시험 모델 · 2099" });
    await p.getByRole("button", { name: "적용", exact: true }).click();
    await expect(p.getByText("합성 일기 0", { exact: true })).toBeVisible();
    await expect(p.getByText("합성 일기 2", { exact: true })).toBeVisible();
    await expect(p.getByText("합성 일기 1", { exact: true })).toHaveCount(0);
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (native) {
      await expect(
        p.getByText("기기에 저장됨 · 연결 필요", { exact: true }),
      ).toBeVisible();
      await expect(p.getByText("동기화 완료", { exact: true })).toBeVisible();
      await p.getByRole("button", { name: "검색", exact: true }).click();
      await p.getByRole("button", { name: "초기화", exact: true }).click();
      await expect(p.getByText("동기화 대기", { exact: true })).toBeVisible();
      await expect(p.locator("[data-sync-state]")).toContainText("수신 대기");
      await p.evaluate(() => {
        const w = window as any;
        w.nativeStatus({ paired: true, syncing: true });
      });
      await expect(p.locator("[data-sync-state]")).toHaveText("동기화 중");
      await p.screenshot({
        path: "docs/evidence/connected-ui/c021-car-filter.png",
      });
    } else if (width === 375) {
      await p.screenshot({
        path: "docs/evidence/connected-ui/c021-phone-filter.png",
      });
    }
    expect(errors).toEqual([]);
    await p.close();
  }
  await page(375, 812);
  await page(812, 375);
  await page(1280, 720, true);
  console.log(
    "PASS C021 historical vehicle filtering on phone/landscape/car, distinct sharing states, live receiving status, no horizontal overflow or JS errors.",
  );
} finally {
  await browser.close();
}
