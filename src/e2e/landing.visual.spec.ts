import { test, expect } from "@playwright/test";

/**
 * Visual regression tests for the marketing landing page.
 *
 * Targets four critical surfaces of the editorial layout:
 *   • Sticky header (logo + nav/CTA collapse rules)
 *   • Hero block (H1 + subtitle column with mint border)
 *   • Inline metrics strip (2-col mobile, 4-col desktop)
 *   • Editorial features grid (Magazine layout)
 *
 * Each surface is captured at 375px (mobile) and 768px (tablet) via the
 * project matrix declared in playwright.config.ts. Baselines live next to
 * this spec under landing.visual.spec.ts-snapshots/.
 *
 * Regenerate baselines after intentional design changes:
 *   bunx playwright test src/e2e/landing.visual.spec.ts --update-snapshots
 */

const LANDING_URL = "/";

test.describe("Landing — visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LANDING_URL, { waitUntil: "networkidle" });
    // Wait for custom fonts (Urbanist / Epilogue) so glyph metrics are stable.
    await page.evaluate(() => (document as any).fonts?.ready);
    // Neutralize any in-flight animations / transitions.
    await page.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; }`,
    });
  });

  test("header is visually stable", async ({ page }) => {
    const header = page.getByTestId("landing-header");
    await expect(header).toBeVisible();
    await expect(header).toHaveScreenshot("header.png");
  });

  test("hero block is visually stable", async ({ page }) => {
    const hero = page.getByTestId("landing-hero");
    await expect(hero).toBeVisible();
    await hero.scrollIntoViewIfNeeded();
    await expect(hero).toHaveScreenshot("hero.png");
  });

  test("metrics strip is visually stable", async ({ page }) => {
    const metrics = page.getByTestId("landing-metrics");
    await metrics.scrollIntoViewIfNeeded();
    await expect(metrics).toBeVisible();
    await expect(metrics).toHaveScreenshot("metrics.png");
  });

  test("editorial features grid is visually stable", async ({ page }) => {
    const features = page.getByTestId("landing-features-grid");
    await features.scrollIntoViewIfNeeded();
    await expect(features).toBeVisible();
    await expect(features).toHaveScreenshot("features-grid.png");
  });
});
