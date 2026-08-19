import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright-конфиг проекта.
 *
 * Проекты:
 *   api          — API-смоук по ролям (src/e2e/api), браузер не нужен
 *   ui-desktop   — UI-смоук по ролям, десктоп 1280×900
 *   ui-mobile    — UI-смоук по ролям, мобильный 390×844
 *   mobile-375 / tablet-768 — визуальная регрессия лендинга (src/e2e/landing.*)
 *
 * Базовый URL: PLAYWRIGHT_BASE_URL / E2E_BASE_URL (по умолчанию http://localhost:8080).
 */
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./src/e2e",
  timeout: 60_000,
  // На боевом стенде не грузим прод параллельными браузерами сверх меры.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  expect: {
    // Allow tiny anti-aliasing/font-shaping differences between machines.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "api",
      testDir: "./src/e2e/api",
      use: {},
    },
    {
      name: "ui-desktop",
      testDir: "./src/e2e/ui",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "ui-mobile",
      testDir: "./src/e2e/ui",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-375",
      testMatch: /landing\..*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 800 } },
    },
    {
      name: "tablet-768",
      testMatch: /landing\..*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
  ],
});
