# План: полный переезд на Laravel + MySQL (отключение Supabase)

Объём большой — это не «одна задача», а несколько фаз. Делать строго по порядку, иначе фронт сломается.

## Что мы получим в итоге
- Один источник истины: MySQL на `growth-peak.pro`.
- Аутентификация (email/пароль + Google OAuth) — через Laravel + Sanctum + Socialite.
- Весь фронт ходит только в `https://growth-peak.pro/api/*`. Никаких `supabase-js`.
- Все Postgres `FUNCTION`/`TRIGGER`/RPC переписаны как Laravel-эндпоинты или Eloquent observers.
- Edge Functions (Gemini) переезжают в Laravel controllers.
- Файлы (storage) — в S3-совместимое хранилище или локальный диск Laravel.

---

## Фаза 1. Аудит и фиксация схемы (1 проход)
1. Снять полный дамп схемы Supabase: таблицы, enums (`app_role`), индексы, FK.
2. Сравнить с уже существующими миграциями `backend-laravel/database/migrations/`. Составить список **недостающих** таблиц/колонок/enums.
3. Зафиксировать список **всех Postgres-функций и триггеров** (их ~30+: `has_role`, `get_user_company_id`, `handle_new_user`, `award_currency`, `grant_rewards_for_event`, `create_shop_order`, `fulfill_shop_order`, `submit_employee_questionnaire`, `verify_user`, `delete_user`, `reject_user`, `notify_career_event`, `review_career_step`, `sync_step_goals_to_personal`, `bulk_invite_employees`, `submit_demo_request`, `submit_pricing_inquiry`, `register_company`, и т.д.) — каждая станет либо RPC-эндпоинтом, либо Eloquent observer/job.

## Фаза 2. Доведение MySQL-схемы до паритета
- Дописать недостающие миграции (таблицы магазина, наград, валюты, инвайтов, тикетов, уведомлений, оценок и т.п.).
- Перевести Postgres `ENUM` (`app_role`) в MySQL `ENUM` или строковую колонку с CHECK-валидацией в Laravel.
- Перевести `jsonb` → `JSON` (MySQL 8 поддерживает).
- Перенести индексы.

## Фаза 3. Миграция данных из Supabase → MySQL
- Экспорт через `pg_dump --data-only --inserts` отдельно по таблицам (порядок с учётом FK).
- Маппинг `auth.users` → Laravel `users` (UUID сохраняем как `char(36)` PK, чтобы все FK совпали).
- Скрипт-импортёр на artisan-команде, идемпотентный (по email/uuid).
- Пароли Supabase (bcrypt) — переносятся как есть, Laravel умеет их валидировать.

## Фаза 4. Аутентификация
- Email/пароль: уже есть (`AuthController`).
- **Google OAuth**: ставим `laravel/socialite`, эндпоинты `/api/auth/google/redirect` и `/api/auth/google/callback`, на колбэке — find-or-create `users` + `profiles` + дефолтный `user_roles` row, выдаём Sanctum-токен, редиректим на фронт с токеном в hash.
- Sanctum personal access token уже используется — оставляем.
- Удаляем все упоминания Supabase Auth с фронта.

## Фаза 5. Переписывание Postgres-функций
Каждая RPC становится `POST /api/rpc/<name>` в Laravel-контроллере. Например:
- `verify_user`, `reject_user`, `delete_user` → `UserAdminController`
- `award_currency`, `create_shop_order`, `fulfill_shop_order` → `ShopController` + транзакции
- `grant_rewards_for_event`, `on_*` триггеры → Eloquent **observers** на соответствующих моделях
- `handle_new_user` → выполняется внутри `AuthController::register` и Google-callback
- `bulk_invite_employees`, `submit_demo_request`, `submit_pricing_inquiry`, `register_company` → отдельные контроллеры
- `notify_career_event`, `sync_step_goals_to_personal` → сервисные классы, вызываются из observers

## Фаза 6. Edge Functions → Laravel
- Все Gemini-функции (AI-ассессмент, парсинг документов, AI-советы для тикетов и т.п.) перенести в Laravel-контроллеры; ключ `GEMINI_API_KEY` или `AI_API_KEY` берём из `.env` Laravel.
- Хранение чатов/сессий — в MySQL.

## Фаза 7. Storage
- Заменить Supabase Storage на Laravel `Storage` (диск `s3` либо локальный + nginx).
- Эндпоинты upload/download/signed-url в Laravel.

## Фаза 8. Фронт: выпиливание supabase-js
- Удалить `@supabase/supabase-js` из `package.json`.
- Удалить `src/integrations/supabase/*` (оставить пустой шим, если есть импорты, — но лучше пройтись и заменить все).
- Все `supabase.from(...)` уже завёрнуты в Laravel-клиент через `/api/db/*` — добить оставшиеся места.
- Все `supabase.auth.*` → методы `laravelClient.auth.*`.
- Все `supabase.functions.invoke(...)` → `laravelClient.rpc(...)` / прямые fetch на новые Laravel-эндпоинты.
- Realtime (если используется) — отказаться или заменить на polling/SSE.

## Фаза 9. Отключение Supabase
- После прохождения regression-тестов (логин email + Google, регистрация, верификация, дашборды каждой роли, магазин, ассессмент).
- В Lovable Cloud — Disable Cloud (необратимо, понимаешь риски).
- Удалить `VITE_SUPABASE_*` из кода.

---

## Технические детали

```text
backend-laravel/
  app/Http/Controllers/Api/
    Auth/AuthController.php          (email + Google callback)
    Auth/GoogleController.php        (Socialite redirect)
    Rpc/UserAdminController.php      (verify/reject/delete)
    Rpc/ShopController.php           (create_order, fulfill_order)
    Rpc/CurrencyController.php       (award)
    Rpc/InvitationsController.php    (bulk_invite)
    Rpc/QuestionnaireController.php
    Rpc/DemoController.php
    Rpc/PricingController.php
    Rpc/CompanyController.php        (register_company)
    Rpc/CareerController.php         (review_step, sync_goals)
    Ai/AssessmentController.php
    Ai/DocumentParseController.php
    Storage/UploadController.php
  app/Observers/
    ProfileObserver.php              (на месте on_profile_updated)
    AssessmentObserver.php
    CareerGoalObserver.php
    EmployeeRewardObserver.php
    CareerAssignmentObserver.php
    TestAttemptObserver.php
  app/Services/
    RewardService.php                (grant_rewards_for_event)
    NotificationService.php          (notify_career_event)
    CareerSyncService.php            (sync_step_goals_to_personal)
```

Фронт:
```text
src/integrations/laravel/
  client.ts            (уже есть, расширяем)
  auth.ts              (login, register, google, logout, me)
  rpc.ts               (rpc('verify_user', {...}))
  storage.ts           (upload, signed url)
  ai.ts                (assessment chat, parse_document)
```

---

## Оценка объёма
- Фазы 1–4: 1 итерация (бэкенд готов к логину + базовому CRUD).
- Фазы 5–7: 3–5 итераций (по группам функций).
- Фаза 8: 2–3 итерации (зависит от того, сколько мест на фронте ещё дергают supabase).
- Фаза 9: финальный clean-up.

## Что нужно от тебя сейчас
1. **Подтвердить:** на проде MySQL будет хостить `growth-peak.pro`, Supabase отключаем целиком — данные старых юзеров надо переносить **из Supabase в MySQL** (или они одноразовые тестовые и можно начать с чистого листа?).
2. **Google OAuth credentials:** свой `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Google Cloud Console → OAuth 2.0 Web Application, redirect `https://growth-peak.pro/api/auth/google/callback`).
3. **Storage:** S3-совместимое (какое именно — AWS/Yandex/Selectel/MinIO) или хватит локального диска nginx?
4. **AI ключ:** `GEMINI_API_KEY` для Laravel `.env` (сейчас он живёт в Supabase Edge Functions secrets).
5. С какой фазы начинаем — **Фаза 1 (аудит схемы)** или сразу прыгаем в **Фазу 4 (Google OAuth в Laravel)**, если данные переносить не надо?

После твоих ответов начну Фазу 1 и пойдём по порядку.