/**
 * Предполётная проверка E2E-прогона.
 *
 * Ловит две ситуации, которые раньше выглядели как загадочные падения
 * («Cannot navigate to invalid URL») или как ложно-зелёный прогон
 * («31 skipped»):
 *   1) стенд не сконфигурирован / недоступен;
 *   2) не заданы креды ни для одной роли — смоук ничего не проверяет.
 */
import { test, expect } from "@playwright/test";
import { api, BASE_URL, API_URL, rolesWithCreds, ALL_ROLES } from "../support/api";

test.describe("preflight", () => {
  test("стенд сконфигурирован и отвечает", async () => {
    console.log(`[e2e] BASE_URL=${BASE_URL}`);
    console.log(`[e2e] API_URL=${API_URL}`);

    expect(BASE_URL, "E2E_BASE_URL пуст — задайте секрет E2E_BASE_URL").not.toBe("");
    expect(BASE_URL, "E2E_BASE_URL должен быть абсолютным http(s)-URL").toMatch(/^https?:\/\/.+/);

    const res = await api("/health");
    expect(
      res.status,
      `Стенд ${API_URL} недоступен (GET /health → ${res.status}). ` +
        "Проверьте, что фронт/бэк задеплоены и E2E_BASE_URL указывает на живой контур.",
    ).toBe(200);
  });

  test("заданы креды хотя бы для одной роли", async () => {
    const roles = rolesWithCreds();
    console.log(`[e2e] роли с кредами: ${roles.join(", ") || "нет"}`);
    expect(
      roles.length,
      "Не заданы секреты E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD ни для одной роли " +
        `(${ALL_ROLES.join(", ")}) — ролевой смоук будет пропущен и прогон ничего не проверит.`,
    ).toBeGreaterThan(0);
  });
});
