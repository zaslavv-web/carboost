# Развёртывание Career Track on-premise

Полностью автономная установка на собственный сервер. Никаких внешних SaaS,
никаких зарубежных runtime-зависимостей.

## Архитектура

```
Browser → nginx (TLS) → SPA-бандл (React, Vite)
                     ↘ /api/* → Laravel (php-fpm) → PostgreSQL
                                                  ↘ Redis (cache/queue)
                                                  ↘ AI Gateway (любой OpenAI-совместимый, в т.ч. self-hosted vLLM/Ollama)
                                                  ↘ SMTP (Yandex 360 / корпоративный)
```

## Компоненты

| Слой | Технология | Источник |
|---|---|---|
| Frontend | React 18 + Vite 5 + Tailwind | этот репозиторий |
| Backend API | Laravel 11 + Sanctum | `backend-laravel/` |
| БД | PostgreSQL 14+ | self-hosted |
| Кэш / очереди | Redis 7+ | self-hosted |
| AI | OpenAI-совместимый endpoint | OpenRouter / vLLM / Ollama / внутренний шлюз |
| Почта | SMTP (Yandex 360 / Mail.ru / корпоративный relay) | self-hosted |

## Шаги

### 1. Frontend

```bash
bun install
bun run build
# артефакты в dist/ — раздаются nginx
```

Или через Docker:

```bash
docker compose up -d web
```

### 2. Backend (Laravel)

```bash
cd backend-laravel
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
php artisan migrate --force
php artisan storage:link
```

php-fpm + nginx — см. `deploy/` и `DEPLOYMENT.md`.

### 3. Переменные окружения

Минимально необходимое (`.env` Laravel):

```
APP_ENV=production
APP_KEY=base64:...
APP_URL=https://example.local

DB_CONNECTION=pgsql
DB_HOST=postgres
DB_DATABASE=careertrack
DB_USERNAME=careertrack
DB_PASSWORD=...

REDIS_HOST=redis

AI_API_URL=http://vllm:8000/v1/chat/completions   # или любой OpenAI-совместимый
AI_API_KEY=...
AI_MODEL=gpt-4o-mini

GOOGLE_CLIENT_ID=...           # опционально, можно отключить SSO
GOOGLE_CLIENT_SECRET=...

SMTP_PASSWORD=...
```

Frontend (`.env` корня репозитория, build-time):

```
VITE_LARAVEL_API_URL=/api
```

### 4. Что **отсутствует** в on-premise

- Внешние SaaS-зависимости отсутствуют полностью.
- AI работает через ваш собственный endpoint, указанный в `AI_API_URL`.

### 5. Smoke-проверка после деплоя

```bash
curl -i https://your-domain/                        # 200, отдаёт SPA
curl -i https://your-domain/api/auth/me             # 401 (без токена) — норма
```
