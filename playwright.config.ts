import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "apps/web/tests/e2e",
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_ORIGIN ?? "http://127.0.0.1:3017",
    channel: "chrome",
    headless: true,
  },
  projects: [
    {
      name: "phone",
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "tablet", use: { viewport: { width: 1024, height: 768 } } },
  ],
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: "pnpm --filter @diary/web start --port 3017",
        url: "http://127.0.0.1:3017/api/health",
        reuseExistingServer: !process.env.CI,
      },
  reporter: "list",
});
