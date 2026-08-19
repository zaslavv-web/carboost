/**
 * UI-смоук по ролям: подставляем Sanctum-токен в localStorage и обходим
 * ключевые маршруты, проверяя, что страница отрендерилась, в консоли нет
 * ошибок и ни один XHR не вернул 5xx.
 */
import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, loginAs, credsFor, type Role } from "../support/api";

const ROUTE_MAP: Record<Role, string[]> = {
  EMPLOYEE: ["/", "/profile", "/courses", "/chats", "/motivation/earn"],
  MANAGER: ["/", "/team", "/tracker", "/chats", "/motivation/earn"],
  HR: ["/", "/employees", "/courses", "/surveys", "/motivation/earn"],
  HRD: ["/", "/employees", "/analytics", "/predictive-analytics", "/talent-review", "/courses"],
  ADMIN: ["/", "/employees", "/security", "/settings"],
  SUPERADMIN: ["/", "/admin"],
};

/** Шум, который не является дефектом приложения. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /favicon/i,
  /ResizeObserver loop/i,
  /net::ERR_NETWORK_CHANGED/i,
];

async function instrument(page: Page) {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });

  page.on("response", (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
  });

  return { consoleErrors, serverErrors };
}

for (const role of Object.keys(ROUTE_MAP) as Role[]) {
  test.describe(`UI ${role}`, () => {
    test.skip(!credsFor(role), `нет E2E_${role}_EMAIL / E2E_${role}_PASSWORD`);

    test(`ключевые маршруты открываются без ошибок`, async ({ page }) => {
      const token = await loginAs(role);
      test.skip(!token, "логин не удался");

      const { consoleErrors, serverErrors } = await instrument(page);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.evaluate((t) => window.localStorage.setItem("laravel_token", t), token!);

      for (const route of ROUTE_MAP[role]) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        // Приложение отрисовало хоть что-то, а не белый экран/крэш-баундари.
        await expect(page.locator("body"), `${route}: пустой экран`).not.toHaveText("");
        const crashed = await page.getByText(/Something went wrong|Произошла ошибка/i).count();
        expect(crashed, `${route}: crash boundary`).toBe(0);
      }

      expect(serverErrors, "5xx во время обхода UI").toEqual([]);
      expect(consoleErrors, "ошибки в консоли").toEqual([]);
    });
  });
}

test.describe("гость", () => {
  test("лендинг открывается и ведёт на /login", async ({ page }) => {
    const { serverErrors } = await instrument(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/.+/);
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("input[type=email], input[name=email]").first()).toBeVisible();
    expect(serverErrors).toEqual([]);
  });
});
