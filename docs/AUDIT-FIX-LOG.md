# Автофиксы аудита 2026-07-01

Атомарные правки, применённые в ходе полного аудита. Все — категории P1 «безопасно фиксить автоматически».

## 1. [P1 Security] Rate-limit публичных auth и RPC endpoint'ов

**Файл**: `backend-laravel/routes/api.php` (65-91)

`/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` обёрнуты в `throttle:10,1` (10 запросов в минуту на IP). Публичные `/rpc/submit_demo_request`, `/rpc/submit_pricing_inquiry`, `/analytics/ingest` — в `throttle:30,1`. Закрывает brute-force логина и спам форм.

## 2. [P1 Security] HTTP security headers в nginx

**Файл**: `deploy/nginx.conf`

Во все `location`-блоки добавлены:
- `X-Frame-Options: SAMEORIGIN` (для API — `DENY`) — защита от clickjacking.
- `X-Content-Type-Options: nosniff` — блокирует MIME-sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin` (для API — `no-referrer`) — не течёт полный URL на внешние сайты.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` — ограничивает Powerful Features.

CSP не добавлен намеренно — из-за динамических Recharts inline-styles потребует настройки nonce или `unsafe-inline`, требует отдельной итерации.

## 3. [P1 UX] `min-h-screen` → `min-h-dvh` на mobile-shell страницах

**Файлы (11)**: `src/components/ProtectedRoute.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/MobileEmployeeLayout.tsx`, `src/components/AppLayout.tsx`, `src/pages/Pricing.tsx`, `src/pages/CompleteRegistration.tsx`, `src/pages/FeaturePage.tsx`, `src/pages/NotFound.tsx`, `src/pages/Landing.tsx`, `src/pages/Login.tsx`, `src/pages/ResetPassword.tsx`

`min-h-dvh` учитывает динамическую высоту viewport на iOS Safari — контент больше не режется UI-баром браузера.

---

## Что осталось на ручную проработку (топ-5)

1. Закрыть `/diag` под superadmin (P1).
2. Ввести `React.lazy` code-splitting для тяжёлых страниц Analytics/Tracker/ReactFlow (P1).
3. Постепенно убрать 272 `as any` через типизированные Laravel-хелперы (P1).
4. Вынести отправку webhook'ов в очередь (P2).
5. Добавить feature-тесты для Wave 3–6 контроллеров (P2).

## 2026-07-05 · HRD-симуляция на боевом сервере

Прогнан [`scripts/hrd-simulation.mjs`](../scripts/hrd-simulation.mjs) под аккаунтом
`hrd.01@demo.pikrosta.ru` на `growth-peak.pro`. Найдено 13 реальных багов
(5 critical, 2 high, 6 medium). Исправлены все критические + основные medium:

- **PeopleAnalytics** `risk/hiring/absence` 500 → неверный столбец `risk_score`, groupBy-alias.
- **AssessmentScenario POST** 500 → `created_by` NOT NULL без auto-fill.
- **Position POST** 500 → fillable/rules ссылались на legacy-колонки, отсутствующие в схеме.
- **Db bridge hr_tasks** 404 → таблица не была в MODEL_MAP, ломала HRDEmployeeMap.
- **Risk/Comfort recompute** 422 → `$user->company_id` вместо `$user->companyId()`.

Полный отчёт: [`docs/HRD-SIMULATION-REPORT.md`](./HRD-SIMULATION-REPORT.md).
