import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// E2E-смоук: браузерный прогон главного сценария (вход → урок → награды).
// Ловит то, что юнит-тесты не видят в принципе — например, поломку iframe
// из-за CSP или сломанный рендер после апгрейда Next.
//
// Приложение поднимается на ОТДЕЛЬНОЙ схеме БД (DATABASE_SCHEMA=e2e,
// см. e2e/sandbox.ts) и на порту 3100 — чтобы не мешать твоему обычному
// dev-серверу на 3000 и не трогать живые данные учеников.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Тесты пишут в общую схему-песочницу — параллелить их нельзя.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,

  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    // Скриншот и трасса остаются только от упавшего теста — по ним видно,
    // что именно сломалось, без повторного прогона.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_SCHEMA: "e2e",
      // E2E is our staging environment: it checks the deliberately more
      // contrasty test palette while Production and localhost stay bright.
      KVANTO_DEPLOYMENT_ENV: "staging",
      KVANTOLINGO_E2E: "1",
    },
  },
});
