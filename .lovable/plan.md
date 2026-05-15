
# Миграция Career Track: Supabase → Laravel 11

## Целевая архитектура

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Frontend (React/Vite)      │  HTTPS  │  api.example.ru              │
│  app.example.ru             │ ──────▶ │  ┌────────────────────────┐  │
│  • supabase-js УДАЛЁН       │         │  │ Laravel 11 + PHP-FPM   │  │
│  • src/lib/api/* (fetch)    │         │  │ • Sanctum (SPA tokens) │  │
│  • src/lib/realtime         │         │  │ • Socialite (Google)   │  │
│  │  (Echo + Reverb)         │         │  │ • Policies = бывш. RLS │  │
│  • TanStack Query как есть  │         │  │ • Jobs (бывш. Edge fn) │  │
└─────────────────────────────┘         │  │ • Reverb (WebSockets)  │  │
                                        │  └─────────┬──────────────┘  │
                                        │            ▼                 │
                                        │  ┌────────────────────────┐  │
                                        │  │ PostgreSQL 15 (тот же  │  │
                                        │  │ дамп из Supabase)      │  │
                                        │  └────────────────────────┘  │
                                        └──────────────────────────────┘
```

Хостинг: один российский VPS, всё в Docker Compose.

## Что сохраняется

- **Пароли пользователей** — Supabase хранит bcrypt в `auth.users.encrypted_password`; Laravel читает bcrypt нативно. Существующие пользователи логинятся теми же паролями.
- **Google SSO** — Socialite ищет пользователя по email; если есть — линкует google_id, если нет — создаёт. Пользователи, которые раньше входили через Google, продолжат входить через Google.
- **Все данные** — `pg_dump`/`pg_restore` всей схемы `public`.
- **Frontend UX** — те же страницы, роутинг, дизайн. Меняется только слой данных.

## Что неизбежно сломается на момент переключения

- Активные сессии всех пользователей — нужен повторный вход (один раз).
- Realtime-подписки на Supabase channels — заменяются на Laravel Echo + Reverb.
- AI Edge Functions на Deno — переписываются как Laravel Jobs/Controllers.

## Фазы (каждая — отдельное сообщение от вас «следующая фаза»)

### Фаза 1. Скелет Laravel-бэка в `backend-laravel/`
- `composer.json`, `artisan`, базовая структура `app/`, `routes/`, `database/`, `config/`
- `Dockerfile` (PHP 8.3-FPM + nginx), `docker-compose.yml`
- `.env.example` со всеми переменными
- Установка: Sanctum, Socialite, Reverb, Predis, Spatie/Permission (для ролей)
- README с инструкцией поднятия

### Фаза 2. Миграции БД (читают существующий дамп, не пересоздают)
- `database/migrations/` — формальные миграции в стиле Laravel **поверх** существующей схемы (отметка «уже накатано» через `migrate:install` + ручной seed `migrations`-таблицы)
- Скрипт переноса: `scripts/import-supabase-dump.sh` (pg_restore + создание ролей Laravel)
- Маппинг таблиц: `auth.users` → используем как есть (Sanctum умеет любую таблицу users), `public.profiles`, `public.user_roles`, `public.companies` и т.д.

### Фаза 3. Auth
- Eloquent-модель `User` поверх `auth.users` (с bcrypt-верификацией паролей Supabase)
- `POST /api/auth/login` (email+пароль → Sanctum token)
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/google/redirect`, `GET /api/auth/google/callback` (Socialite, линковка по email)
- `POST /api/auth/password/reset`, `POST /api/auth/password/update`
- Middleware `auth:sanctum` + `EnsureVerified` (миграция логики `is_verified`)

### Фаза 4. Роли и Policies (замена RLS)
- Eloquent Policies: `CompanyPolicy`, `ProfilePolicy`, `CareerTrackPolicy` и т.д.
- Глобальный scope `BelongsToCompany` — автоматическая фильтрация по `company_id` для всех запросов не-superadmin
- Сохраняем RLS на уровне БД как **второй слой защиты** (defense-in-depth)
- Импорт ролей из `public.user_roles`

### Фаза 5. CRUD-контроллеры (по группам)
Группы в порядке приоритета:
1. `companies`, `profiles`, `user_roles` — без них ничего не работает
2. `career_tracks`, `career_track_steps`, `step_submissions`
3. `positions`, `org_structure`, `scenarios`
4. `tickets`, `notifications`, `messages`
5. `shop_*`, `gamification_*`, `pricing_inquiries`
6. `hrd_tests`, `assessments`

Каждый контроллер: index/show/store/update/destroy + специфичные actions. Form Requests для валидации.

### Фаза 6. AI-функции (Edge Functions → Jobs)
13 функций переписываются на PHP с тем же контрактом запрос/ответ:
- `assessment-chat` → `POST /api/ai/assessment-chat`
- `generate-career-paths` → `POST /api/ai/career-paths`
- `parse-org-structure`, `parse-hr-document`, `parse-test-document`, `parse-position-standards`
- `generate-closed-test`, `generate-default-track-steps`, `generate-positions-from-org`, `generate-questionnaire-profile`, `generate-step-scenario`
- `suggest-ticket-fix`
- `admin-create-user`

Один общий `App\Services\AiClient` (HTTP-клиент к OpenAI-совместимому шлюзу), читает `AI_API_URL`/`AI_API_KEY`/`AI_MODEL` из `.env`.

### Фаза 7. Realtime (Reverb + Echo)
- Поднимаем `php artisan reverb:start` в docker-compose
- Broadcasting events для: `NotificationCreated`, `TicketUpdated`, `MessageSent` и других каналов, где сейчас используется Supabase Realtime
- Frontend: `laravel-echo` + `pusher-js` вместо `supabase.channel(...)`

### Фаза 8. Storage (файлы)
- Laravel Filesystem с локальным диском `storage/app/public` или S3-совместимым (Selectel Object Storage)
- Замена `supabase.storage.from('hrd-tests')` на `POST /api/files/upload` + Policies для чтения

### Фаза 9. Frontend: убираем supabase-js
Создаётся `src/lib/api/`:
- `client.ts` — fetch-обёртка с auth-токеном из localStorage
- `auth.ts` — login/logout/me/oauth (контракт совместим с текущим `AuthContext`)
- `[entity].ts` — по файлу на каждую сущность, методы `list/get/create/update/remove`
- `realtime.ts` — Echo-инстанс

Замена в коде:
- `supabase.from('x').select(...)` → `api.x.list(...)`
- `supabase.auth.*` → `api.auth.*`
- `supabase.functions.invoke('y', { body })` → `api.ai.y(body)`
- `supabase.channel(...)` → `realtime.channel(...).listen(...)`
- `supabase.storage.from(...)` → `api.files.*`

Удаление: `@supabase/supabase-js`, `src/integrations/supabase/`. Файл `types.ts` заменяется на ручные типы `src/lib/api/types.ts` (или генерация из Laravel через `spatie/laravel-typescript-transformer`).

### Фаза 10. Деплой и переключение
- Финальный `docker-compose.prod.yml`: nginx + php-fpm + postgres + reverb + redis + frontend
- Скрипт миграции данных в день переключения (последний `pg_dump` из Supabase → restore в новый Postgres)
- Окно простоя: ~30 минут (дамп + restore + DNS-переключение)
- Откат: DNS обратно на старый фронт (старый бэк не трогаем 1–2 недели)

## Срок и нагрузка

Реалистично: **6–10 недель** активной работы. Каждая фаза — несколько сообщений (особенно фаза 5 — много контроллеров, и фаза 9 — много файлов фронта). Между фазами вы тестируете на своём VPS.

## Технические детали

**PHP-стек:**
- PHP 8.3, Laravel 11
- `laravel/sanctum` (auth tokens)
- `laravel/socialite` (Google OAuth)
- `laravel/reverb` (WebSockets)
- `spatie/laravel-permission` (роли + права)
- `predis/predis` (Redis cache)
- `guzzlehttp/guzzle` (AI HTTP)

**Структура `backend-laravel/`:**
```
backend-laravel/
├── app/
│   ├── Http/Controllers/Api/
│   ├── Http/Requests/
│   ├── Models/
│   ├── Policies/
│   ├── Services/AiClient.php
│   ├── Jobs/
│   └── Events/
├── routes/api.php
├── database/migrations/
├── config/
├── docker/
│   ├── php-fpm/Dockerfile
│   ├── nginx/default.conf
│   └── reverb/Dockerfile
├── docker-compose.yml
├── composer.json
├── artisan
└── .env.example
```

**Frontend изменения:**
- `src/integrations/supabase/` → удалить после фазы 10
- Новый `src/lib/api/` — основной слой данных
- `src/contexts/AuthContext.tsx` — переписать на `api.auth`
- `package.json`: убрать `@supabase/supabase-js`, добавить `laravel-echo`, `pusher-js`

**Важное предупреждение про Lovable:**
- Я не могу запустить `php artisan` или протестировать PHP-код в песочнице. Каждая PHP-правка проверяется вами на VPS.
- Lovable Cloud не управляет Laravel-бэком — это полностью ваша инфраструктура.
- Папка `backend/` (текущий self-host Supabase) останется как страховка/для отката, удалим после успешного переключения.

## Чего я **НЕ** буду делать без отдельного запроса

- Менять дизайн/UX — все страницы остаются как есть.
- Менять бизнес-логику ролей/верификации — переношу один-к-одному.
- Удалять Supabase-код до фазы 10 — приложение продолжит работать на старом бэке весь период миграции.

---

**Если план ОК — отвечайте «Фаза 1, поехали»**, и я создам скелет Laravel-проекта в `backend-laravel/`.
