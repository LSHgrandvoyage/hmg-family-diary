import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--mute-audio"],
});
await mkdir("test-results/c037", { recursive: true });
try {
  for (const dark of [false, true])
    for (const native of [false, true]) {
      const page = await browser.newPage({
        viewport: native
          ? { width: 1280, height: 720 }
          : { width: 375, height: 812 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ dark, native }) => {
          const w = window as any;
          w.__name = (v: any) => v;
          w.calls = [];
          w.EventSource = undefined;
          localStorage.setItem("chagok-theme-v1", dark ? "dark" : "light");
          w.state = {
            paired: false,
            server_setup_available: true,
            server_configured: true,
            vehicle: { nickname: "합성 우리 차" },
            theme_mode: dark ? "dark" : "light",
            theme_dark: dark,
            version: "0.2.1",
          };
          if (native)
            w.NativeDiary = {
              theme: () => JSON.stringify(w.state),
              invoke: (raw: string) => {
                const r = JSON.parse(raw);
                w.calls.push(r);
                const answer =
                  r.cmd === "list"
                    ? { items: [] }
                    : r.cmd === "state"
                      ? { ...w.state, settings: w.state }
                      : w.state;
                setTimeout(() => w.NativeReply(r.id, answer), 0);
              },
            };
        },
        { dark, native },
      );
      await page.route("https://c037.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.startsWith("/api/")) {
          const data = path.endsWith("/devices")
            ? { devices: [] }
            : path.endsWith("/pairings")
              ? { code: "012345", expires_at: "2099-01-01T00:05:00Z" }
              : path.endsWith("/sessions")
                ? { items: [] }
                : { vault_id: "synthetic" };
          await route.fulfill({ json: data });
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
      await page.goto(
        "https://c037.test/faithful/app.html#" +
          (native ? "carsettings" : "connect"),
      );
      if (native) {
        await page
          .getByRole("button", { name: "휴대폰 연결하기", exact: true })
          .click();
        const input = page.getByRole("textbox", {
          name: "6자리 연결 코드",
          exact: true,
        });
        await expect(input).toBeVisible();
        await expect(input).toHaveAttribute(
          "placeholder",
          "6자리 연결 코드를 입력해주세요",
        );
        expect(
          await input.evaluate((e) => e.matches(":placeholder-shown")),
        ).toBe(true);
        await input.fill("012345");
        expect(
          await input.evaluate((e) => e.matches(":placeholder-shown")),
        ).toBe(false);
        await page.screenshot({
          path: `test-results/c037/vehicle-${dark ? "dark" : "light"}.png`,
        });
        await page
          .getByRole("button", { name: "연결하기", exact: true })
          .click();
        expect(
          await page.evaluate(
            () =>
              (window as any).calls.find((r: any) => r.cmd === "pairVehicle")
                ?.code,
          ),
        ).toBe("012345");
        await page.evaluate(() => {
          const w = window as any;
          w.state.server_configured = false;
          w.DiarySettings.update(w.state);
        });
        await page
          .getByRole("button", { name: "휴대폰 연결하기", exact: true })
          .click();
        expect(
          await page.evaluate(() =>
            (window as any).calls.some(
              (r: any) => r.cmd === "importServerSettings",
            ),
          ),
        ).toBe(true);
        await expect(input).toHaveCount(0);
      } else {
        await page
          .getByRole("button", { name: "차량 연결 코드 만들기", exact: true })
          .click();
        const digits = page.locator(".pairing-code-digits > span");
        await expect(digits).toHaveCount(6);
        await expect(digits).toHaveText(["0", "1", "2", "3", "4", "5"]);
        for (let i = 0; i < 6; i++) await expect(digits.nth(i)).toBeVisible();
        await page.screenshot({
          path: `test-results/c037/mobile-${dark ? "dark" : "light"}.png`,
        });
      }
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.close();
    }
  console.log(
    "PASS C037 six cells/leading zero, placeholder visibility, native submit, missing-server routing, both themes. Synthetic browser bridge/API.",
  );
} finally {
  await browser.close();
}
