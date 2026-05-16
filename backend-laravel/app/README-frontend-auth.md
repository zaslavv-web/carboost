# Phase 9 — Frontend auth bridge

Фронтенд-аутентификация переведена на Laravel/Sanctum в режиме **bridge**:
старый Supabase `AuthContext` остаётся по-умолчанию, а Laravel-вариант
включается переменной окружения. Это даёт безопасный, обратимый переход без
одномоментного переписывания всех страниц.

## Что добавлено

| Файл | Назначение |
|------|------------|
| `src/integrations/laravel/client.ts` | `aiInvoke` + `laravel.{get,post,patch,delete}` (Phase 8) |
| `src/integrations/laravel/auth.ts` | `laravelAuthApi.{login, register, me, logout, signInWithGoogle, consumeOauthToken, resetPasswordForEmail, updatePassword}` |
| `src/contexts/LaravelAuthContext.tsx` | Drop-in совместимый `AuthContext` поверх Sanctum |
| `src/hooks/useLaravelProfile.ts` | Замены `useUserProfile`/`useUserRoles`/`usePrimaryRole` (`/api/profiles/*` + `/api/auth/me`) |

## Контракт API на стороне Laravel

Уже реализовано в Phase 3/6:

```
POST /api/auth/register     -> { token, user }
POST /api/auth/login        -> { token, user }
POST /api/auth/logout       -> 204
GET  /api/auth/me           -> { ...user, roles: [...] }
GET  /api/auth/google/redirect?return_to=<url>
GET  /api/auth/google/callback   -> 302 redirect=<url>#access_token=<sanctum>

GET  /api/profiles/me       -> UserProfile
GET  /api/profiles/{id}     -> UserProfile (+ roles[])
```

`AuthController::me` должен возвращать массив `roles` — добавьте
`return [...$user->toArray(), 'roles' => $user->roles->pluck('role')]`.

`ProfileController::show` должен включать `roles` в payload (через
`$profile->user->roles->pluck('role')`).

Если этих полей пока нет — добавьте их в Phase 9.5 одним коммитом, иначе
`useLaravelRoles` будет возвращать пустой массив.

## Как переключить фронтенд на Laravel auth

1. В `.env` добавьте:
   ```
   VITE_AUTH_BACKEND=laravel
   VITE_LARAVEL_API_URL=https://api.your-domain.tld/api
   ```

2. В `src/main.tsx` оборачивайте `<App />` через выбор провайдера:
   ```tsx
   import { AuthProvider } from "@/contexts/AuthContext";
   import { LaravelAuthProvider } from "@/contexts/LaravelAuthContext";

   const Provider =
     import.meta.env.VITE_AUTH_BACKEND === "laravel"
       ? LaravelAuthProvider
       : AuthProvider;

   root.render(<Provider><App /></Provider>);
   ```

3. На страницах, которые уже используют `useUserProfile` / `usePrimaryRole`,
   переключение делается per-страница: меняете импорт на
   `@/hooks/useLaravelProfile` (одна строка). Хук-ответ совместим.

## OAuth (Google)

`laravelAuthApi.signInWithGoogle()` редиректит на Laravel endpoint, бэкенд
после успеха возвращает пользователя на фронт с `#access_token=...` в hash.
`LaravelAuthProvider` на маунте автоматически вызывает `consumeOauthToken()`
— токен сохраняется в `localStorage.laravel_token`, query чистится.

## Reset password

`laravelAuthApi.resetPasswordForEmail(email, redirectTo)` ожидает на бэке:
- `POST /api/auth/forgot-password { email, redirectTo }`
- `POST /api/auth/reset-password  { token, password }`

Эти эндпоинты ещё не реализованы (текущий `AuthController` имеет только
register/login/logout/me) — добавьте их перед включением reset-flow на проде.

## Что НЕ входит в Phase 9

- Массовая замена `supabase.from(...)` на `laravel.get/post(...)` в страницах
  CRUD — это **Phase 10**.
- Realtime (Postgres changes) → Laravel Reverb — **Phase 11**.
- Storage (`supabase.storage`) → Laravel Storage + signed URLs — **Phase 11**.

Bridge-подход означает, что во время миграции страницы могут смешанно
использовать оба бэкенда (auth — Laravel, данные — Supabase) без поломок,
пока выполняется параллельная репликация БД из Phase 1-2.
