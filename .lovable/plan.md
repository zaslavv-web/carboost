## Цель

Сделать так, чтобы Lovable preview (`*.lovableproject.com` / `id-preview--*.lovable.app`) логинился и работал с реальным Laravel-API на `https://growth-peak.pro`.

Сейчас фронт в preview бьёт в `/api/*` относительно `lovableproject.com`, где нет Laravel → Lovable отдаёт HTML 404 → клиент пишет «Backend недоступен: сервер вернул HTML вместо JSON».

## Что сделаю

### 1. Frontend: `.env` для preview

Добавлю в корневой `.env` (и `.env.example`):

```
VITE_LARAVEL_API_URL=https://growth-peak.pro/api
```

`src/integrations/laravel/client.ts` и `auth.ts` уже читают `VITE_LARAVEL_API_URL` — переключение прозрачное.

После этого все вызовы из preview (`/auth/login`, `/auth/me`, `/rpc/*`, `/geo`, `/analytics/ingest`, OAuth redirect на Google/Yandex) пойдут на прод.

### 2. Backend (на VPS, инструкция, не код)

Чтобы браузер не получил CORS-ошибку с preview-домена, на проде надо разрешить два origin:

- `https://id-preview--ab323b5c-25ac-417c-ba3d-2939937a2a0d.lovable.app`
- `https://ab323b5c-25ac-417c-ba3d-2939937a2a0d.lovableproject.com`

Открою `backend-laravel/config/cors.php` (если нет — создам) и добавлю эти origin в `allowed_origins` рядом с боевым. Для Sanctum-токенов (Bearer в localStorage) cookies не нужны, `supports_credentials` оставляем как есть.

Это правка кода в репо → задеплоится автоматически через `npm-publish.yml`.

### 3. Google/Yandex OAuth

В Google Cloud Console (и Yandex ID) нужно добавить authorized redirect URI:

- `https://growth-peak.pro/api/auth/google/callback` (уже должен быть)
- НО return_to из preview будет `https://...lovableproject.com/...` — это передаётся как query-параметр, провайдеру не важно. Достаточно того, что callback на growth-peak.pro и `APP_FRONTEND_URL` поддерживает редирект обратно.

В `GoogleAuthController` проверю, что `return_to` whitelist пропускает `*.lovableproject.com` / `*.lovable.app` — иначе после Google вас выкинет на прод-фронт вместо preview. При необходимости расширю whitelist.

## Файлы

- `.env` — добавить `VITE_LARAVEL_API_URL=https://growth-peak.pro/api`
- `.env.example` — то же, для документации
- `backend-laravel/config/cors.php` — разрешить preview-домены
- `backend-laravel/app/Http/Controllers/Api/GoogleAuthController.php` (и Yandex) — whitelist preview-доменов в return_to (если есть проверка)

## Проверка

1. Перезагрузить preview → `/api/auth/me` уходит на `https://growth-peak.pro/api/auth/me` (видно в Network)
2. Логин под `zaslavv@gmail.com` → 200 + токен
3. Если CORS-ошибка — после деплоя бэка повторить  
  
а не проще дать тебе учетку чтобы ты сам залогинился на боевой сервер?
  &nbsp;