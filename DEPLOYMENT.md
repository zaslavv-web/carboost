# Career Track — деплой On-Premise

Этот документ описывает деплой Career Track на собственный сервер **без зависимости от Lovable Cloud и Supabase**. Реальный рантайм — это:

```
Browser → nginx (TLS) → SPA-бандл (React)
                     ↘ /api/* → Laravel (php-fpm) → PostgreSQL
                                                  ↘ Redis (cache/queue)
                                                  ↘ AI Gateway (любой OpenAI-совместимый)
                                                  ↘ SMTP (Yandex/Gmail/...)
```

Никакого Supabase в проде нет: Laravel сам обслуживает БД, авторизацию (Sanctum), очереди и AI-прокси.

---

## 0. Что уже сделано в коде

| Что было | Как сейчас |
|---|---|
| Lovable OAuth через `lovable.auth.signInWithOAuth` | Удалён мёртвый модуль `src/integrations/lovable/`, npm-пакет `@lovable.dev/cloud-auth-js` удалён |
| Прямые вызовы Lovable AI Gateway из Edge Functions | Весь AI идёт через `App\Services\AI\AiGatewayService` в Laravel; читает `AI_API_URL` / `AI_API_KEY` / `AI_MODEL` |
| Фронт обращался к Supabase | 49 файлов фронта импортируют только `@/integrations/laravel/*`. Никаких прямых обращений к Supabase в `src/` нет |
| Lovable-only сборка | `vite.config.ts` загружает `lovable-tagger` опционально — если пакета нет, сборка проходит |
| Конфиг разбросан | `.env.example` описывает все необходимые переменные |

Файлы `src/integrations/supabase/client.ts` и `types.ts` физически присутствуют (Lovable их регенерирует автоматически), но никто из приложения их не импортирует — tree-shaking исключает их из прод-бандла.

---

## 1. Требования к серверу

- Linux (Ubuntu 22.04+/Debian 12+)
- Docker 24+ и Docker Compose v2
- 2 vCPU / 4 GB RAM минимум (8 GB рекомендовано)
- Доменное имя + TLS (Let's Encrypt через nginx или Traefik)
- Исходящий SMTP-доступ (TCP 465/587)
- Исходящий HTTPS к AI-провайдеру (если используется внешний — OpenAI / OpenRouter / Yandex GPT). Для air-gapped используйте локальный vLLM/Ollama с OpenAI-совместимым API

---

## 2. Переменные окружения

Скопируйте `.env.example` → `.env` и заполните.

### Frontend (build-time)

| Переменная | Назначение | Пример |
|---|---|---|
| `VITE_LARAVEL_API_URL` | Путь к API. На том же домене — `/api` | `/api` |
| `VITE_REVERB_KEY` / `VITE_REVERB_HOST` / `VITE_REVERB_PORT` / `VITE_REVERB_SCHEME` | Реалтайм через Laravel Reverb. Опционально — если realtime не нужен, оставить пустым | `''` |

### Backend (`backend-laravel/.env`)

Минимум:

```dotenv
APP_NAME="Career Track"
APP_ENV=production
APP_KEY=base64:...                 # php artisan key:generate
APP_URL=https://growth-peak.pro

# DB
DB_CONNECTION=pgsql
DB_HOST=db
DB_PORT=5432
DB_DATABASE=careertrack
DB_USERNAME=careertrack
DB_PASSWORD=...

# Cache / sessions / queue
CACHE_DRIVER=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_HOST=redis
REDIS_PORT=6379

# Sanctum (cookie-based auth для SPA на том же домене)
SANCTUM_STATEFUL_DOMAINS=growth-peak.pro
SESSION_DOMAIN=.growth-peak.pro

# AI Gateway — любой OpenAI-совместимый endpoint
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini

# SMTP
MAIL_MAILER=smtp
MAIL_HOST=smtp.yandex.ru
MAIL_PORT=465
MAIL_ENCRYPTION=ssl
MAIL_USERNAME=robot@your-domain.ru
MAIL_PASSWORD=...                  # App password
MAIL_FROM_ADDRESS=robot@your-domain.ru
MAIL_FROM_NAME="Career Track"

# Google OAuth (опционально)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://growth-peak.pro/api/auth/google/callback
```

### AI: варианты провайдера

| Провайдер | `AI_API_URL` | Примечание |
|---|---|---|
| OpenAI | `https://api.openai.com/v1/chat/completions` | Стандарт, поддерживает GPT-* |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | Один ключ — доступ к множеству моделей |
| Yandex GPT | через OpenAI-совместимый прокси (`yandex-gpt-openai-proxy`) | Для размещения в РФ |
| vLLM / Ollama (self-hosted) | `http://vllm:8000/v1/chat/completions` | Полный air-gapped |

В коде ничего менять не нужно — `AiGatewayService` сам подставит модель из `AI_MODEL`.

---

## 3. Docker Compose (рекомендуемая конфигурация)

Используйте уже существующий `docker-compose.yml` в корне. Стандартный набор сервисов:

| Сервис | Образ / билд | Назначение |
|---|---|---|
| `web` | `nginx:alpine` | TLS-терминация, отдача SPA-бандла, проксирование `/api/*` в `api` |
| `api` | сборка из `backend-laravel/` (php-fpm 8.3) | Laravel application |
| `queue` | тот же образ, что `api` | `php artisan queue:work` |
| `scheduler` | тот же образ | `php artisan schedule:work` (если используются cron-задачи) |
| `db` | `postgres:16-alpine` | PostgreSQL |
| `redis` | `redis:7-alpine` | Cache, sessions, queue |
| `reverb` (опционально) | сборка из `backend-laravel/` | `php artisan reverb:start` — WebSocket-сервер |

Минимальная команда подъёма:

```bash
cp .env.example .env                       # отредактировать
cp backend-laravel/.env.example backend-laravel/.env  # отредактировать
docker compose build
docker compose up -d
docker compose exec api php artisan migrate --force
docker compose exec api php artisan db:seed --force   # только при первой установке
docker compose exec api php artisan storage:link
```

---

## 4. nginx — security headers и SPA fallback

В `backend/deploy/nginx.conf` (или ваш аналог) в блок `server` для прод-домена добавить:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
# CSP — отрегулируйте список доменов под ваш AI-провайдер и Reverb
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; font-src 'self' data:;" always;

# SPA fallback — все неизвестные пути отдают index.html
location / {
    try_files $uri $uri/ /index.html;
}

# API — в Laravel
location /api/ {
    proxy_pass http://api:9000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

TLS: лучше всего использовать `certbot --nginx` или Traefik с автоматическим Let's Encrypt.

---

## 5. Первичная установка данных

```bash
# Миграции схемы
docker compose exec api php artisan migrate --force

# Сидеры (компании, должности, шаблоны треков и т.п.)
docker compose exec api php artisan db:seed --force

# Создать суперадмина (интерактивный artisan-скрипт)
docker compose exec api php artisan tinker
>>> $u = \App\Models\User::create(['name' => 'Admin', 'email' => 'admin@your-domain.ru', 'password' => bcrypt('...')]);
>>> $u->assignRole('superadmin');
```

---

## 6. CI/CD

Текущий `.github/workflows/npm-publish.yml` собирает фронтенд и публикует на сервер. Для on-premise рекомендуется отдельный workflow:

1. `bun install --frozen-lockfile`
2. `bun run build` → `dist/`
3. `rsync` (или Docker image push) → сервер
4. `docker compose pull && docker compose up -d --no-deps web api queue`
5. `docker compose exec api php artisan migrate --force`

`lovable-tagger` в on-prem окружении не нужен — он опциональный (см. `vite.config.ts`).

---

## 7. Что НЕ переносится

- **Lovable preview / автогенерация**: на on-prem нет редактора Lovable, превью-домена `*.lovable.app` и автогенерируемых файлов.
- **Edge Functions Supabase**: их нет в коде — вся серверная логика в Laravel.
- **Lovable AI Gateway по умолчанию**: AI работает через ваш собственный `AI_API_URL`. Никаких обращений к `ai.gateway.lovable.dev` из прода.

---

## 8. Health-чек после деплоя

```bash
# 1) SPA отдаётся
curl -fsSI https://growth-peak.pro/ | head -1

# 2) API живой
curl -fsS https://growth-peak.pro/api/diag | jq

# 3) Регистрация работает (без реальной отправки)
curl -fsS https://growth-peak.pro/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' | jq

# 4) SMTP preflight (как superadmin, нужен Bearer-токен)
curl -fsS https://growth-peak.pro/api/admin/email-settings/preflight \
  -H "Authorization: Bearer $TOKEN" -X POST | jq

# 5) AI ответ (короткий тест из Laravel tinker)
docker compose exec api php artisan tinker
>>> app(\App\Services\AI\AiGatewayService::class)->chat([['role' => 'user', 'content' => 'ping']]);
```

Если все пять ответов — 2xx и осмысленный JSON, миграция на on-prem завершена.
