import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for on-premise build + visual regression on the landing page.
 * Visual snapshots cover the Hero, metrics strip, editorial grid (features) and the
 * sticky header at 375px (mobile) and 768px (tablet) widths.
 */
export default defineConfig({
  testDir: "./src",
  timeout: 30_000,
  expect: {
    // Allow tiny anti-aliasing/font-shaping differences between machines.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    headless: true,
  },
  projects: [
    {
      name: "mobile-375",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 800 } },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
  ],
});
