# Миграции (Фаза 2)

Принцип: **дамп legacy — источник истины для бизнес-схемы**. Laravel-миграции
создают только то, чего в дампе нет.

## Порядок применения

```bash
# 1. Поднимаем Postgres + Redis
docker compose up -d postgres redis

# 2. Импортируем последний дамп legacy
bash scripts/import-legacy-dump.sh /path/to/careertrack.dump

# 3. Накатываем Laravel-миграции поверх (внутри контейнера php-fpm)
docker compose exec php-fpm php artisan migrate --force

# 4. Сидируем роли Spatie из public.user_roles
docker compose exec php-fpm php artisan db:seed --force
```

## Что делает каждая миграция

| Файл | Назначение |
|---|---|
| `0001_..._baseline_legacy_schema.php` | Проверяет, что дамп импортирован (auth.users, public.profiles и т.д.). Падает с понятной ошибкой, если нет. Создаёт extensions `pgcrypto`, `uuid-ossp`. |
| `0001_..._create_sanctum_personal_access_tokens.php` | Таблица `personal_access_tokens` для Sanctum SPA-токенов. tokenable_id = uuid (привязка к auth.users). |
| `0001_..._create_sessions_cache_jobs.php` | Служебные таблицы Laravel: sessions, cache, jobs, failed_jobs. Используются как фолбэк к Redis. |
| `0001_..._create_spatie_permission_tables.php` | Таблицы Spatie: roles, permissions, model_has_roles, model_has_permissions, role_has_permissions. model_id = uuid. |
| `0001_..._laravel_compat_on_auth_users.php` | Делает `auth.users` пригодным для Eloquent: добавляет `remember_token`, создаёт VIEW `public.users` с маппингом колонок (`encrypted_password`→`password`, `raw_user_meta_data`→`meta`) и INSTEAD OF триггер для UPDATE. |

## Что **не** трогаем

- Существующие таблицы из дампа (`public.profiles`, `public.user_roles`, `public.companies`, ~70 таблиц).
- RLS-политики — остаются как **второй слой защиты** (defense-in-depth). Основная авторизация — Eloquent Policies (фаза 4).
- Триггеры legacy (`handle_new_user`, `sync_step_goals_to_personal` и т.д.) — продолжают работать.
- Schema `auth` — legacy создал, мы только добавили `remember_token` колонку.

## Откат

```bash
docker compose exec php-fpm php artisan migrate:rollback --step=10
```

Откатятся только Laravel-таблицы (sanctum, sessions, spatie, view). Дамп
не пострадает.

## Дальше — Фаза 3 (Auth)

В следующем сообщении добавим:
- `app/Models/User.php` поверх view `public.users` с bcrypt-проверкой паролей legacy
- `App\Http\Controllers\Api\AuthController` (login/register/logout/me)
- Socialite-контроллер для Google OAuth с линковкой по email
- Middleware `EnsureVerified` (миграция логики `profiles.is_verified`)
