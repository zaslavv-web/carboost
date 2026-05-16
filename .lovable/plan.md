## Цель

Полностью убрать из фронтенда любые упоминания `@supabase/*`, `supabase`, `VITE_SUPABASE_*` и каталог `src/integrations/supabase/`. После этого ни один запрос из браузера не должен идти на `*.supabase.co` — весь трафик пойдёт на собственный Laravel-домен (`api.<ваш-домен>`), который не блокируется в РФ.

Сейчас в репозитории 49 файлов с упоминанием Supabase (auth, realtime, functions.invoke, storage, types).

## Что мигрируем (4 категории)

### 1. Auth (самый большой блок)
Файлы: `AuthContext.tsx`, `Login.tsx`, `ResetPassword.tsx`, `CompleteRegistration.tsx`, `Settings.tsx`, `UsersManagement.tsx`, `useUserProfile.ts`, plus все страницы, использующие `useAuth()`.

- `AuthContext.tsx` удаляется. В `main.tsx` остаётся только `LaravelAuthProvider`. Хук `useAuth` экспортируется из `LaravelAuthContext` (с тем же API: `session`, `user`, `loading`, `signOut`) — для нулевой ломки всех потребителей.
- `supabase.auth.signInWithPassword` → `laravelAuthApi.login`
- `supabase.auth.signUp` → `laravelAuthApi.register`
- `supabase.auth.signInWithOAuth({provider:'google'})` → `laravelAuthApi.signInWithGoogle`
- `supabase.auth.resetPasswordForEmail` / `updateUser({password})` → `laravelAuthApi.resetPasswordForEmail` / `updatePassword`
- `supabase.auth.getUser/getSession/onAuthStateChange` → методы `LaravelAuthContext.refresh()` + storage event (уже реализовано)
- `lovable.auth.signInWithOAuth` (`src/integrations/lovable/`) удаляется — он завязан на Supabase

### 2. Functions.invoke → Laravel endpoints
Сейчас `supabase.functions.invoke("admin-create-user" | "career-ai-chat" | "ai-document-parse" | ...)` встречается в Support, Assessment, HRDTests, UsersManagement, Positions, Scenarios, HRPolicies, CareerTracksManagement, EmployeeQuestionnaire и т.д.

- Заменяем на универсальный helper `aiInvoke(name, body)` из `src/integrations/laravel/client.ts` (он уже умеет POST на `/api/ai/{name}` с авторизацией).
- Для admin-функций (`admin-create-user`) — отдельный `POST /api/admin/users` (бэкенд-маршрут добавляется в Phase 13.1, см. ниже).

### 3. Realtime (`supabase.channel(...).on('postgres_changes', ...)`)
Сейчас используется в `Notifications.tsx`, `UsersManagement.tsx`, `Cart.tsx`, `Shop.tsx`, и нескольких dashboard'ах.

- Заменяем на `laravelRealtime.channel(table).on(event, cb).subscribe()` из `src/integrations/laravel/realtime.ts` (Reverb / Pusher-совместимый клиент, уже добавлен).
- Если канал не критичен (например, индикатор корзины) — допускается фоллбэк на TanStack Query `refetchInterval`.

### 4. Storage (`supabase.storage.from(...).upload/getPublicUrl/remove`)
В `Settings.tsx`, `ShopAdmin.tsx`, `Onboarding.tsx`.

- Заменяем на `laravelStorage.from(bucket).upload/getPublicUrl/remove` (уже реализовано в Phase 12).

## Зачистка типов и инфраструктуры

- `src/integrations/supabase/client.ts` и `src/integrations/supabase/types.ts` — **удаляются полностью**.
- Типы БД (`Database`, `Tables<...>`) теперь живут в `src/integrations/laravel/types.ts`. Туда копируем структуру из бывшего `types.ts` (без `Database` обёртки от Supabase) — это просто TS-типы, никаких runtime-зависимостей.
- Все импорты `from "@/integrations/supabase/types"` → `from "@/integrations/laravel/types"`.
- Удаляются: каталог `src/integrations/lovable/`, пакет `@supabase/supabase-js` из `package.json`.

## Конфигурация и инфраструктура

- В `.env.example`: убираются `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Остаются только:
  - `VITE_LARAVEL_API_URL=https://api.your-domain.tld/api`
  - `VITE_REVERB_HOST`, `VITE_REVERB_KEY`, `VITE_REVERB_PORT` (для realtime)
- `Dockerfile`: `ARG VITE_SUPABASE_*` удаляются, остаются только `ARG VITE_LARAVEL_API_URL` + Reverb-переменные.
- `backend/deploy/nginx.conf`: блок прокси `^/(auth/v1|rest/v1|storage/v1|...)/` удаляется (больше не нужен). Вместо него — простой `proxy_pass` на Laravel-апстрим для `/api/*` и `/broadcasting/*`.
- Папка `supabase/` в корне (config.toml, functions, migrations) остаётся только как **архив** для справки по логике RPC; в продакшен-сборку не попадает (уже в .dockerignore).

## Что нужно добавить на бэкенде (Phase 13.1, минимальный pre-req)

Если каких-то эндпоинтов в Laravel ещё нет — миграция страниц упадёт. До массовой замены проверяю и при отсутствии добавляю:

1. `POST /api/admin/users` — создание пользователя суперадмином (аналог `admin-create-user`).
2. `POST /api/auth/forgot-password` + `POST /api/auth/reset-password` — reset flow (упомянуто в README Phase 9 как «ещё не реализовано»).
3. `POST /api/ai/{name}` — универсальный AI-роутер для бывших Edge Functions (career-ai-chat, ai-document-parse, ai-org-parse, ai-position-path, ai-scenario, ai-support-tip и т.д.). На стороне Laravel это один контроллер, проксирующий в Gemini через `AI_API_URL`/`AI_API_KEY`.
4. `GET /broadcasting/auth` — для Reverb private/presence каналов (используется в Notifications).

## Порядок выполнения (одной серией коммитов)

1. **Бэкенд-pre-req:** добавить недостающие маршруты выше.
2. **Типы:** скопировать `src/integrations/supabase/types.ts` → `src/integrations/laravel/types.ts`, заменить все импорты.
3. **Auth:** переключить `main.tsx` на `LaravelAuthProvider`, удалить `AuthContext.tsx` (re-export `useAuth` из Laravel-версии), мигрировать `Login`, `ResetPassword`, `CompleteRegistration`, `Settings`, `UsersManagement`.
4. **Functions:** `supabase.functions.invoke` → `aiInvoke` во всех ~12 страницах.
5. **Realtime:** `supabase.channel` → `laravelRealtime.channel` в ~6 страницах.
6. **Storage:** `supabase.storage` → `laravelStorage` (3 страницы).
7. **Удаление:** `src/integrations/supabase/`, `src/integrations/lovable/`, `@supabase/supabase-js` из `package.json`, build-args в Dockerfile, переменные в `.env.example`.
8. **Проверка:** `rg -l "supabase|@supabase" src/` должен вернуть 0 файлов. `tsc --noEmit` — 0 ошибок.

## Риски

- **Сломается preview в Lovable**: Lovable-окружение завязано на `VITE_SUPABASE_*` и автогенерируемые `src/integrations/supabase/{client,types}.ts`. После удаления preview на `*.lovable.app` перестанет работать — все правки нужно будет проверять только на собственном self-hosted билде (`growth-peak.pro`). Это осознанный выбор.
- **Бэкенд должен быть готов**: если на Laravel нет нужного эндпоинта — страница вернёт 404. Поэтому Phase 13.1 обязательна до миграции страниц.
- **Migration не reversible** в одной сессии: 49 файлов в одной серии правок. После старта нельзя «частично» откатиться без `View History`.

## Размер изменения

- Правится: ~49 файлов в `src/`, 2 файла инфраструктуры (`Dockerfile`, `nginx.conf`, `.env.example`), `package.json`.
- Добавляется: ~4 файла на Laravel (контроллеры/маршруты), `src/integrations/laravel/types.ts`.
- Удаляется: каталоги `src/integrations/supabase/`, `src/integrations/lovable/`.

## Подтверждение перед стартом

Одобрите план, и я пройду по шагам 1-8 в одной серии. Особенно важно подтвердить:
- готовы ли вы потерять Lovable-preview (`*.lovable.app`) — после Фазы 13 он перестанет открываться, проверяем только на своём домене;
- какой реальный AI-провайдер крутится на Laravel (Gemini через `AI_API_URL`?) — чтобы я не сломал контракт `aiInvoke`.
