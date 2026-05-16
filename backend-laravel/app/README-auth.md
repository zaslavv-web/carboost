# Авторизация (Фаза 3)

## Стратегия

- **Токены Sanctum** в `localStorage` (не cookies) — простой CORS, работает с любым фронт-доменом.
- **Источник пользователей** — `auth.users` (схема Supabase). Eloquent работает через VIEW `public.users` (см. Фазу 2).
- **Bcrypt-пароли Supabase** — Laravel `Hash::check()` читает их без миграции.
- **Триггер `handle_new_user`** из дампа Supabase автоматически создаёт `profiles` + `user_roles` при `INSERT` в `auth.users` — мы это сохраняем.

## Эндпоинты

| Метод | Путь | Middleware | Описание |
|---|---|---|---|
| POST | `/api/auth/register` | — | email + password + full_name → новый user, токен |
| POST | `/api/auth/login`    | — | email + password → токен |
| POST | `/api/auth/logout`   | `auth:sanctum` | удаляет текущий токен |
| GET  | `/api/auth/me`       | `auth:sanctum` | возвращает user + profile + role |
| GET  | `/api/auth/google/redirect` | — | старт Google OAuth (Socialite) |
| GET  | `/api/auth/google/callback` | — | колбэк, редирект на фронт с `#access_token=` |

## Google SSO

- **Линковка по email**: если `auth.users.email == google.email` — линкуем `google_id` в `raw_user_meta_data`. Существующие Google-пользователи Supabase продолжают входить.
- **Новые** — создаются с `email_confirmed_at = now()`, `provider=google` в meta.
- Триггер `handle_new_user` создаст профиль + роль `employee` автоматически.

## Middleware

- `auth:sanctum` — стандартный Sanctum.
- `EnsureVerified` — 403 если `profiles.is_verified=false`. Используется на всех защищённых API кроме самого auth и onboarding.
- `EnsureHasCompany` — 403 + `code:missing_company` если у профиля нет `company_id`. Фронт ловит код и редиректит на `/complete-registration`.

Регистрация в `bootstrap/app.php` (это уже делает `scripts/bootstrap.sh`):
```php
$middleware->alias([
    'verified.user' => \App\Http\Middleware\EnsureVerified::class,
    'has.company'   => \App\Http\Middleware\EnsureHasCompany::class,
]);
```

## .env

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.example.ru/api/auth/google/callback
APP_FRONTEND_URL=https://app.example.ru
SANCTUM_EXPIRATION=                # пусто = бессрочно
```

В Google Cloud Console добавьте Authorized redirect URI:
- `https://api.example.ru/api/auth/google/callback`

## Что НЕ изменилось

- Пароли пользователей.
- ID пользователей (UUID из `auth.users`).
- `profiles.is_verified`, `user_roles.role` — те же.
- Триггеры (`handle_new_user`, `assign_role`, `verify_user`, `reject_user`) — работают как есть, вызываются через `DB::statement('SELECT public.verify_user(?)', [$id])`.

## Что меняется для пользователя

- Активная сессия (refresh_token Supabase) сбрасывается → один повторный вход.
- При входе через Google пользователь видит обычный consent-screen (новый OAuth client).

## Дальше — Фаза 4 (Policies = замена RLS)

В следующем сообщении: Eloquent Policies для всех таблиц + глобальный scope `BelongsToCompany`.
