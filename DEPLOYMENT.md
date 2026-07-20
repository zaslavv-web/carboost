# Career Track — Deployment

Полная инструкция по on-premise развёртыванию находится в [`docs/ON-PREMISE.md`](docs/ON-PREMISE.md).

Кратко:

- Frontend: React + Vite, корень репозитория. Сборка: `npm ci && npm run build` (или `bun install && bun run build`), артефакты в `dist/`. Nginx: `deploy/nginx.conf` (root `/usr/share/nginx/html`).
- Backend: Laravel 11 + Sanctum в `backend-laravel/`.
- БД: PostgreSQL или MySQL.
- Кэш / очереди: Redis.
- AI: любой OpenAI-совместимый endpoint через `AI_API_URL` / `AI_API_KEY` (можно self-hosted vLLM / Ollama / внутренний шлюз).
- Почта: SMTP (по умолчанию Yandex 360, см. `backend-laravel/config/service-infra.php`).

## Деплой фронта на growth-peak.pro

Требуется Node.js >= 20 (проще всего через nvm: `nvm install 20`).

```bash
cd /path/to/repo            # корень с package.json + vite.config.ts
deploy/deploy-frontend.sh   # git reset, npm ci, npm run build, atomic swap в WEB_ROOT
```

Скрипт `deploy/deploy-frontend.sh`:

- `git fetch + reset --hard origin/main` (отключается `SKIP_GIT=1`),
- `npm ci` при наличии `package-lock.json`, иначе `npm install` / `bun install`,
- `npm run build` (Vite → `dist/`),
- атомарная замена `WEB_ROOT` (по умолчанию `/usr/share/nginx/html`) с бэкапом в `${WEB_ROOT}.bak`,
- `nginx -s reload`.

Переменные окружения: `FRONT_DIR`, `WEB_ROOT`, `GIT_BRANCH`, `SKIP_GIT`, `NPM_BIN`, `DEPLOY_LOG`.

## Деплой бэкенда

`deploy/deploy-laravel.sh` — composer install, миграции, кеши. Запускается в каталоге Laravel-приложения (обычно `/var/www/api` или `backend-laravel/`).

См. также `docker-compose.yml` для контейнерного запуска и `deploy/` для конфигов nginx / php-fpm.

Архив устаревших артефактов (legacy, Lovable Cloud) — `old/lovable-legacy/`.

