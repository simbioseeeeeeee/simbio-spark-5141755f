import { defineConfig, devices } from "@playwright/test";

// QA do CRM: roda contra produção (ou QA_BASE_URL). Sequencial de propósito —
// as suítes compartilham os mesmos leads QA-*.
export default defineConfig({
  testDir: "./tests/qa",
  timeout: 240000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.QA_BASE_URL || "https://crm.simbiosedigital.com",
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
