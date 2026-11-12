import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
const records = [0, 1].map((index) => ({
  id: `synthetic-${index}.wav`,
  saved: true,
  draft_current: true,
  audio_ready: true,
  photos: [],
  snapshot: {
    recorded_at: "2099-11-12T12:00:00Z",
    text: "합성 기록",
    duration_ms: 1000,
    context: index ? { vehicle: {} } : undefined,
    draft: JSON.stringify({
      groups: [{ label: "합성 일기", statements: [{ text: "합성 이야기" }] }],
    }),
  },
}));
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
        : { width: 375, height: 844 },
    });
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(
      ({ native, records }) => {
        const w = window as any;
        w.__name = (v: any) => v;
        w.EventSource = undefined;
        w.calls = [];
        if (!localStorage.getItem("chagok-theme-v1"))
          localStorage.setItem("chagok-theme-v1", "auto");
        w.state = {
          paired: true,
          device_label: "합성 우리 차",
          last_synced_at: "2099-11-12T10:00:00Z",
          vehicle: {
            nickname: "우리집 아이오닉",
            brand: "현대",
            model: "IONIQ 5",
            type: "SUV",
            year: "2025",
            plate: "",
            source: "manual",
          },
          version: "0.1.0",
          location_granted: false,
          theme_mode: "dark",
          theme_dark: true,
        };
        if (native)
          w.NativeDiary = {
            theme: () => JSON.stringify(w.state),
            invoke: (raw: string) => {
              const r = JSON.parse(raw);
              w.calls.push(r);
              let answer = w.state;
              if (r.cmd === "setTheme") {
                w.state = {
                  ...w.state,
                  theme_mode: r.mode,
                  theme_dark: r.mode !== "light",
                };
                answer = w.state;
              }
              if (r.cmd === "state") answer = { ...w.state, settings: w.state };
              if (r.cmd === "list") answer = { items: records };
              if (r.cmd === "settings") w.openNativeSettings();
              if (r.cmd === "lookupVehicle")
                answer = {
                  values: {
                    brand: "조회 제조사",
                    model: "조회 모델",
                    year: "2026",
                  },
                  notice: "확인한 차량 정보를 채웠어요.",
                  source: "emulator_assisted",
                };
              if (r.cmd === "saveVehicle") {
                if (w.failSave) answer = { error: "합성 저장 실패" };
                else {
                  w.state = {
                    ...w.state,
                    vehicle: r.vehicle,
                    device_label: r.vehicle.nickname,
                  };
                  answer = w.state;
                }
              }
              if (r.cmd === "renameVehicle" || r.cmd === "pairVehicle") {
                w.state = {
                  ...w.state,
                  paired: true,
                  device_label: w.state.vehicle.nickname,
                };
                answer = w.state;
              }
              if (r.cmd === "syncSettings") {
                w.state = { ...w.state, sync_notice: "동기화 완료" };
                answer = w.state;
              }
              if (r.cmd === "locationSettings") {
                w.state = { ...w.state, location_granted: true };
                answer = w.state;
              }
              setTimeout(
                () => w.NativeReply(r.id, answer),
                r.cmd === "lookupVehicle" ? 180 : 10,
              );
            },
          };
      },
      { native, records },
    );
    await p.route("https://c029.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith("/api/")) {
        await route.fulfill({
          json: path.endsWith("/sessions")
            ? { items: records }
            : path.endsWith("/devices")
              ? { devices: [] }
              : records[0],
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
    await p.emulateMedia({ colorScheme: "dark" });
    await p.goto(
      `https://c029.test/faithful/app.html#${native ? "carsettings" : "main"}`,
    );
    if (!native) {
      for (const width of [375, 390, 812]) {
        await p.setViewportSize({ width, height: width === 812 ? 375 : 844 });
        await expect(p.locator("[data-theme-auto]")).toHaveCount(0);
        await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
        await p
          .getByRole("button", { name: "다크 모드로 전환", exact: true })
          .click();
        await p.emulateMedia({ colorScheme: "light" });
        await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
        // Reload must preserve the chosen theme, without introducing an auto option.
        await p.reload();
        await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
        await p.getByRole("button", { name: "검색", exact: true }).click();
        await expect(
          p.getByRole("heading", { name: "검색", exact: true }),
        ).toBeVisible();
        expect(
          await p
            .getByLabel("기록 당시 차량 필터")
            .locator("option")
            .allTextContents(),
        ).toEqual(["모든 차량", "차량 정보 없음"]);
        await p.getByRole("button", { name: "검색 닫기", exact: true }).click();
        await p.getByRole("link", { name: "가족", exact: true }).click();
        await expect(
          p.getByRole("button", { name: "화면 설정", exact: true }),
        ).toHaveCount(0);
        await p.getByRole("button", { name: "가족 닫기", exact: true }).click();
        await p.screenshot({
          path: `docs/evidence/connected-ui/c029-phone-${width}-dark.png`,
        });
        await p
          .getByRole("button", { name: "라이트 모드로 전환", exact: true })
          .click();
        await p.emulateMedia({ colorScheme: "dark" });
        await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    } else {
      await expect(
        p.getByText("휴대폰과 연결됨", { exact: true }),
      ).toBeVisible();
      let railBounds: any;
      for (const route of ["carsettings", "carhome", "carlist"]) {
        await p.evaluate((route) => {
          location.hash = route;
        }, route);
        await expect(p.locator("[data-page]")).toHaveAttribute(
          "data-page",
          route,
        );
        await expect(p.locator("[data-page]")).toHaveCSS(
          "visibility",
          "visible",
        );
        await expect(p.locator("nav .theme-shortcut button")).toHaveCount(1);
        await expect(
          p.locator("[data-theme-auto],[data-settings-theme]"),
        ).toHaveCount(0);
        const cycle = p.locator("[data-theme-cycle]");
        const bounds = await cycle.boundingBox();
        if (railBounds) expect(bounds).toEqual(railBounds);
        else railBounds = bounds;
        await expect(p.locator("nav a[aria-current]")).toHaveText(
          route === "carsettings"
            ? "설정"
            : route === "carhome"
              ? "녹음"
              : "일기",
        );
        for (const expected of ["auto", "light", "dark"]) {
          await cycle.click();
          await expect(cycle).toHaveAttribute("data-current-theme", expected);
          await expect(cycle).toBeEnabled();
          if (expected !== "auto")
            await expect(p.locator(".theme-notice")).toHaveCount(0);
          await p.screenshot({
            path: `docs/evidence/connected-ui/c030-${route}-${expected}.png`,
          });
        }
      }
      await p.evaluate(() => {
        location.hash = "carsettings";
      });
      await expect(p.locator("[data-connection-title]")).toBeVisible();
      await expect(
        p.getByRole("region", { name: "화면 모드", exact: true }),
      ).toHaveCount(0);
      await p.getByRole("button", { name: "지금 동기화", exact: true }).click();
      await expect(p.locator("[data-connection-notice]")).toHaveText(
        "동기화 완료",
      );
      await expect(
        p.getByRole("button", { name: "연결 별칭 수정", exact: true }),
      ).toHaveCount(0);
      await expect(p.locator("[data-connection-edit]")).toBeHidden();
      await p.getByRole("button", { name: "권한 설정", exact: true }).click();
      await expect(p.locator("[data-location-state]")).toHaveText(
        "위치 권한 허용됨",
      );
      await p.evaluate(() => {
        const w = window as any;
        w.state.vehicle.brand = "";
        w.state.vehicle.year = "";
        w.DiarySettings.update(w.state);
      });
      await p
        .getByRole("button", { name: "차량 정보 수정", exact: true })
        .click();
      await p.getByLabel("제조사", { exact: true }).fill("직접 입력");
      await expect(p.getByLabel("연식", { exact: true })).toHaveValue("2026");
      await expect(p.getByLabel("제조사", { exact: true })).toHaveValue(
        "직접 입력",
      );
      await expect(p.getByLabel("모델", { exact: true })).toHaveValue(
        "IONIQ 5",
      );
      await expect(p.getByLabel("차 별명", { exact: true })).toHaveAttribute(
        "maxlength",
        "40",
      );
      await p.getByLabel("차 별명", { exact: true }).fill("새 별명");
      await p.evaluate(() => ((window as any).failSave = true));
      await p.getByRole("button", { name: "저장", exact: true }).click();
      await expect(
        p.getByText("합성 저장 실패", { exact: true }),
      ).toBeVisible();
      await p.getByRole("button", { name: "확인", exact: true }).click();
      await expect(p.getByLabel("차 별명", { exact: true })).toHaveValue(
        "새 별명",
      );
      await p.evaluate(() => ((window as any).failSave = false));
      await p.getByRole("button", { name: "저장", exact: true }).click();
      await expect(p.locator("[data-vehicle-name]")).toHaveText("새 별명");
      expect(await p.evaluate(() => (window as any).state.device_label)).toBe(
        "새 별명",
      );
      await p.getByRole("link", { name: "녹음", exact: true }).click();
      await expect(p.locator("[data-page]")).toHaveAttribute(
        "data-page",
        "carhome",
      );
      await p.locator('nav a[href="#"]').click();
      await expect(p.locator("[data-page]")).toHaveAttribute(
        "data-page",
        "carsettings",
      );
      await p.evaluate(() => (window as any).settingsBack());
      await expect(p.locator("[data-page]")).toHaveAttribute(
        "data-page",
        "carhome",
      );
      await p.goto("https://c029.test/faithful/app.html#carsettings");
      await p.getByText("휴대폰과 연결됨", { exact: true }).waitFor();
      await p.evaluate(() => {
        const w = window as any;
        w.state.paired = false;
        w.DiarySettings.update(w.state);
      });
      await p
        .getByRole("button", { name: "휴대폰 연결하기", exact: true })
        .click();
      await expect(p.getByLabel("연결 기기 별칭")).toHaveCount(0);
      await p.getByLabel("6자리 연결 코드").fill("123");
      await p.getByRole("button", { name: "연결하기", exact: true }).click();
      expect(
        await p.evaluate(
          () =>
            (window as any).calls.filter((r: any) => r.cmd === "pairVehicle")
              .length,
        ),
      ).toBe(0);
      await p.getByLabel("6자리 연결 코드").fill("123456");
      await p.getByRole("button", { name: "연결하기", exact: true }).click();
      await expect(
        p.getByText("휴대폰과 연결됨", { exact: true }),
      ).toBeVisible();
      await expect(p.locator("dialog[open]")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    await p.close();
  }
  console.log(
    "PASS C031 unified car name and single editor; C030 shared rail/theme cycle; C029 settings/mobile regressions (synthetic bridge).",
  );
} finally {
  await browser.close();
}
