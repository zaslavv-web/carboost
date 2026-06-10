# Phase 10 + 11 — CRUD / RPC / Storage / Realtime bridges

Bridge-слой завершает миграцию: бэкенд получает обобщённые контроллеры для
всего, что фронтенд раньше делал через `legacy.from`, `legacy.rpc` и
`legacy.storage`. Страницы остаются нетронутыми и переключаются точечно
заменой импорта, как и в Phase 8/9.

## Backend (Laravel overlay)

| Файл | Назначение |
|------|------------|
| `app/Http/Controllers/Api/DbController.php` | Generic CRUD over a whitelisted model map (Phase 5 модели). PostgREST-стиль фильтров: `?eq.col=val`, `?in.col=a,b`, `?order=col.desc`, `?range=0-49`, `?single=1`. Авторизация через политики Phase 4 (`Gate::allows`). |
| `app/Http/Controllers/Api/RpcController.php` | 15 whitelisted Postgres функций (`verify_user`, `create_shop_order`, `submit_employee_questionnaire`, …). Подкладывает `auth.uid()` в `set_config('request.jwt.claim.sub', ...)` — существующие SECURITY DEFINER функции работают без изменений. Локализует ошибки PG в русский. |
| `app/Http/Controllers/Api/StorageController.php` | 7 бакетов 1:1 с legacy Storage. Public bucket → постоянный URL, private → `temporaryUrl(ttl)`. |
| `config/filesystems.php` | Диски для всех 7 бакетов. Локально → `storage/app/{public,private}/<bucket>`. На проде один флаг `STORAGE_DRIVER=s3` + AWS_* переменные → S3. |

### Реестры (что доступно по умолчанию)

- **Tables** (`DbController::MODEL_MAP`): 33 таблицы — все основные доменные сущности из Phase 5.
- **RPCs** (`RpcController::FUNCTIONS`): 15 функций (включая публичные `submit_demo_request`, `submit_pricing_inquiry`).
- **Buckets** (`StorageController::BUCKETS`): `avatars`, `reward-images`, `shop-products` (public), `hr-documents`, `hrd-tests`, `employee-questionnaires`, `career-submissions` (private).

Любая попытка обратиться к таблице/RPC/бакету вне whitelist → 404 с сообщением на русском.

## Frontend (`src/integrations/laravel/`)

| Файл | Drop-in замена |
|------|----------------|
| `db.ts` (`laravelDb`) | `legacy.from(t).select().eq().order().limit().range().single().maybeSingle().insert().update().upsert().delete()` |
| `rpc.ts` (`laravelRpc`) | `legacy.rpc(name, params)` |
| `storage.ts` (`laravelStorage`) | `legacy.storage.from(bucket).upload/createSignedUrl/getPublicUrl/remove` |
| `realtime.ts` (`laravelRealtime`) | `legacy.channel(name).on('postgres_changes', filter, cb).subscribe()` (lazy-loads `laravel-echo` + `pusher-js`) |

Все возвращают тот же `{ data, error }`, что и legacy-js — переключение page-by-page это одно изменение импорта.

## Per-page миграция (рекомендуемый порядок)

```
- import { legacy } from "@/integrations/legacy/client";
+ import { laravelDb as db } from "@/integrations/laravel/db";
+ import { laravelRpc } from "@/integrations/laravel/rpc";
+ import { laravelStorage } from "@/integrations/laravel/storage";
```

Затем поиск/замена:
- `legacy.from(` → `db.from(`
- `legacy.rpc(` → `laravelRpc(` (и распаковать аргументы из `{params}` в объект)
- `legacy.storage.from(` → `laravelStorage.from(`

Realtime-каналов в текущем фронтенде нет — `realtime.ts` готов для будущих фич.

## Realtime (Reverb) — серверная часть

Минимальные шаги (вне overlay, чтобы не дублировать секреты):

1. `composer require laravel/reverb` в полученном Laravel-проекте.
2. `php artisan reverb:install` — поднимет конфиг и worker.
3. `php artisan reverb:start` (или Docker `docker/reverb/Dockerfile` — уже есть).
4. Триггерить события через стандартный Laravel `broadcast(new PostgresChange(...))`. Payload должен матчить shape `{ eventType, new, old, schema, table }`, чтобы фронт-шим работал без правок.

## Что НЕ сделано (намеренно)

- **Массовая правка страниц** — bridge не переписывает `src/pages/*.tsx`. Это
  отложено до Phase 12 (per-page swap), когда параллельная репликация БД из
  Phase 1-2 позволит безопасно переключать трафик.
- **Подгрузка `laravel-echo` / `pusher-js`** — добавлены как dynamic import.
  Если включаете realtime, добавьте их в `package.json`:
  ```bash
  bun add laravel-echo pusher-js
  ```

## Конфиг (frontend `.env`)

```
VITE_LARAVEL_API_URL=https://api.your-domain.tld/api
VITE_AUTH_BACKEND=laravel
# Realtime (опционально)
VITE_REVERB_KEY=...
VITE_REVERB_HOST=ws.your-domain.tld
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
```

## Конфиг (backend `.env`)

```
# Storage
STORAGE_DRIVER=s3            # или local
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=...
AWS_BUCKET_PREFIX=careertrack-   # bucket = prefix + legacy-name

# Reverb
REVERB_APP_ID=...
REVERB_APP_KEY=...
REVERB_APP_SECRET=...
```
