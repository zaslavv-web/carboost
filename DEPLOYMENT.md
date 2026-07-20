# Career Track — Deployment

Полная инструкция по on-premise развёртыванию находится в [`docs/ON-PREMISE.md`](docs/ON-PREMISE.md).

Кратко:

- Frontend: React + Vite, корень репозитория. Сборка: `npm ci && npm run build` (или `bun install && bun run build`), артефакты в `dist/`. Nginx: `deploy/nginx.conf` (root `/usr/share/nginx/html`).
- Backend: Laravel 11 + Sanctum в `backend-laravel/`.
- БД: PostgreSQL или MySQL.
- Кэш / очереди: Redis.
- AI: любой OpenAI-совместимый endpoint через `AI_API_URL` / `AI_API_KEY` (можно self-hosted vLLM / Ollama / внутренний шлюз).
- Почта: SMTP (по умолчанию Yandex 360, см. `backend-laravel/config/service-infra.php`).

## Автодеплой фронта на growth-peak.pro (GitHub Actions)

Workflow: `.github/workflows/deploy-frontend.yml`.

**Что делает:** при push в `main` (кроме изменений только в `backend-laravel/`, `docs/`, `*.md`) собирает `bun install && bun run build` и раскладывает `dist/` на сервер по SSH через `rsync`, исключая `backend/` и `.htaccess`.

**Целевые пути:**
- `DEPLOY_HOST`: `ssh.gro7659365.nichost.ru`
- `DEPLOY_USER`: `gro7659365`
- `WEB_ROOT`: `/home/gro7659365/growth-peak.pro/docs`  (SPA), рядом Laravel в `docs/backend/` — **не трогается**.

**Секрет:** `DEPLOY_SSH_KEY` — приватный SSH-ключ пользователя `gro7659365`. Настраивается в GitHub → Settings → Secrets and variables → Actions.

**Ручной запуск:** GitHub → Actions → «Deploy Frontend» → Run workflow. Опция `enable_delete = true` включает `rsync --delete` (удаляет на сервере файлы, которых нет в `dist/`). На первом прогоне держите `false`.

**Rollback:** повторный запуск workflow с предыдущего SHA (Actions → Run workflow → выбрать нужный коммит через `git revert` + push).

## Ручной деплой фронта (запасной путь)

Если Actions недоступен: `deploy/deploy-frontend.sh` в корне репо — делает `git reset --hard`, `npm ci`/`bun install`, `npm run build`, атомарную замену `WEB_ROOT` c бэкапом в `${WEB_ROOT}.bak`. Переменные окружения: `FRONT_DIR`, `WEB_ROOT`, `GIT_BRANCH`, `SKIP_GIT`, `NPM_BIN`, `DEPLOY_LOG`.



## Деплой бэкенда

`deploy/deploy-laravel.sh` — composer install, миграции, кеши. Запускается в каталоге Laravel-приложения (обычно `/var/www/api` или `backend-laravel/`).

См. также `docker-compose.yml` для контейнерного запуска и `deploy/` для конфигов nginx / php-fpm.

Архив устаревших артефактов (legacy, Lovable Cloud) — `old/lovable-legacy/`.

