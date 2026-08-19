/**
 * API-смоук по всему продукту: под каждой ролью дёргаем ключевые эндпоинты
 * и требуем отсутствия 5xx. Это главный «регресс-щит»: 500-ки, которые
 * ловились руками через F12, теперь ловит CI.
 *
 * Запуск: E2E_BASE_URL=https://growth-peak.pro E2E_HRD_EMAIL=... npx playwright test --project=api
 */
import { test, expect } from "@playwright/test";
import { api, loginAs, credsFor, type Role } from "../support/api";

/** Эндпоинты, доступные любому авторизованному сотруднику. */
const COMMON_ENDPOINTS = [
  "/auth/me",
  "/profiles/me",
  "/employee/today",
  "/notifications",
  "/currency/balance",
  "/currency/earn-rules",
  "/currency/recipients",
  "/currency/transactions",
  "/chats",
  "/chats/unread-count",
];

/** Эндпоинты HR-контура (HRD / HR / админ компании). */
const HR_ENDPOINTS = [
  "/profiles?per_page=50",
  "/db/positions",
  "/db/departments",
  "/db/competencies",
  "/db/career_track_templates",
  "/university/courses",
  "/db/tracker_tasks",
  "/predictive/overview",
  "/predictive/benchmarks",
  "/talent-review/sessions",
  "/talent-pool",
];

const ROLES: Role[] = ["HRD", "HR", "MANAGER", "EMPLOYEE", "ADMIN"];

test.describe("API smoke", () => {
  test("health отвечает и БД доступна", async () => {
    const res = await api<{ checks?: { db?: string } }>("/health");
    expect(res.status, "GET /api/health").toBe(200);
    expect(res.body?.checks?.db, "health.checks.db").toBe("ok");
  });

  for (const role of ROLES) {
    test.describe(`роль ${role}`, () => {
      test.skip(!credsFor(role), `нет E2E_${role}_EMAIL / E2E_${role}_PASSWORD`);

      test("логин выдаёт токен", async () => {
        const token = await loginAs(role);
        expect(token, "Sanctum token").toBeTruthy();
      });

      test("общие эндпоинты без 5xx", async () => {
        const token = await loginAs(role);
        test.skip(!token, "логин не удался");

        const failures: string[] = [];
        for (const path of COMMON_ENDPOINTS) {
          const res = await api(path, { token });
          if (res.status >= 500) failures.push(`${path} → ${res.status} (${res.ms}ms)`);
        }
        expect(failures, "5xx на общих эндпоинтах").toEqual([]);
      });

      test("время ответа профиля разумное", async () => {
        const token = await loginAs(role);
        test.skip(!token, "логин не удался");

        const res = await api("/profiles/me", { token });
        expect(res.status).toBeLessThan(500);
        expect(res.ms, "GET /profiles/me, мс").toBeLessThan(5000);
      });
    });
  }

  test.describe("HR-контур", () => {
    test.skip(!credsFor("HRD"), "нет E2E_HRD_EMAIL / E2E_HRD_PASSWORD");

    test("HR-эндпоинты без 5xx", async () => {
      const token = await loginAs("HRD");
      test.skip(!token, "логин не удался");

      const failures: string[] = [];
      for (const path of HR_ENDPOINTS) {
        const res = await api(path, { token });
        if (res.status >= 500) failures.push(`${path} → ${res.status} (${res.ms}ms)`);
      }
      expect(failures, "5xx на HR-эндпоинтах").toEqual([]);
    });

    test("тяжёлый справочник профилей не падает и укладывается в бюджет", async () => {
      const token = await loginAs("HRD");
      test.skip(!token, "логин не удался");

      const res = await api("/profiles?per_page=200", { token });
      expect(res.status, "GET /profiles?per_page=200").toBeLessThan(500);
      expect(res.ms, "мс").toBeLessThan(8000);
    });
  });

  test.describe("контроль доступа", () => {
    test.skip(!credsFor("EMPLOYEE"), "нет кредов сотрудника");

    test("сотрудник не видит предиктивную аналитику и talent review", async () => {
      const token = await loginAs("EMPLOYEE");
      test.skip(!token, "логин не удался");

      for (const path of ["/predictive/overview", "/talent-review/sessions"]) {
        const res = await api(path, { token });
        expect([401, 403, 404], `${path} должен быть закрыт для employee`).toContain(res.status);
      }
    });

    test("без токена приватные эндпоинты отдают 401", async () => {
      const res = await api("/profiles/me");
      expect(res.status).toBe(401);
    });
  });
});
