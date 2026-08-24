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

Workflow: `.github/workflows/deploy-backend.yml`.

**Что делает:** при push изменений в `backend-laravel/**` синхронизирует Laravel-код в `/home/gro7659365/growth-peak.pro/docs/backend`, выполняет `composer install`, `php artisan migrate --force`, очищает и пересобирает route/config cache. Это критично для новых API-маршрутов вроде `/api/performance-cycles/{id}/open-preflight`.

**Runtime-лимиты PHP:** лимиты поднимаются двумя путями. Основной — в коде: `backend-laravel/bootstrap/app.php` при каждом web-запросе выставляет `memory_limit = 256M` и `max_execution_time = 120`, если текущие значения ниже (работает на любом хостинге, независимо от SAPI). Дополнительно workflow пишет `backend-laravel/public/.user.ini` с теми же значениями — он срабатывает только при PHP-FPM/CGI. Health check `/api/health` возвращает фактический `memory_limit`; деплой падает, если он меньше 256M. Ручное редактирование глобального `php.ini` не требуется.

**Ручной запуск:** GitHub → Actions → «Deploy Backend» → Run workflow. Обычно `run_migrations = true`, `enable_delete = false`.

> ⚠️ **Не делайте `git pull` в `/home/gro7659365/growth-peak.pro/docs/backend`.**
> Приложение работает из этой папки, а репозиторий хранит код в подкаталоге `backend-laravel/`.
> `git pull` создаёт вложенную копию `docs/backend/backend-laravel/`: файлы обновляются,
> но Laravel их не видит — `php artisan migrate` пишет «Nothing to migrate», новые artisan-команды
> «command not found». Доставка кода — только через workflow «Deploy Backend».
> Аварийный ручной путь, если Action недоступен:
> ```bash
> cd /home/gro7659365/growth-peak.pro/docs/backend
> git pull
> rsync -a --exclude '.env' --exclude 'storage' --exclude 'vendor' backend-laravel/ ./
> rm -rf backend-laravel
> php artisan migrate --force && php artisan optimize:clear
> ```
> Workflow при каждом деплое сам удаляет вложенную копию, если она появилась.

### Как проверить, что деплой реально доехал

На сервере (в корне приложения `docs/backend`):

```bash
cat VERSION                                   # должен быть короткий SHA последнего коммита
test ! -d backend-laravel && echo "OK: нет вложенной копии" || echo "ERROR: вложенная backend-laravel/"
grep -c enforceResourceAccess app/Http/Controllers/Api/DbController.php   # >= 5
grep -c 'function authorizeResource' app/Http/Controllers/Api/DbController.php || true  # 0
php -d memory_limit=1024M artisan migrate:status | grep -c Pending        # 0
```

Снаружи:

```bash
curl -sS -H 'Accept: application/json' https://growth-peak.pro/api/health
```

- `checks.version` должен совпадать с `VERSION` и с SHA последнего коммита. Если нет — код не доставлен либо OPcache отдаёт старую копию (`touch public/index.php`).
- `checks.fatals_last_hour` должен перестать расти; `checks.fatals_last_uri` показывает последний упавший запрос.

Проверка ранее падавших эндпоинтов требует токена — **без него всегда `401`**, и это не признак исправления:

```bash
TOKEN='<боевой токен сессии>'
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  'https://growth-peak.pro/api/db/positions?select=id&limit=1'
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  'https://growth-peak.pro/api/db/profiles?select=company_id&maybeSingle=1&eq.user_id=1041'
```

Ожидание: `200`. Если `500` — точный стек берётся с `GET /api/diag/last-fatal` (под авторизацией).

Токен проще всего взять из браузера на боевом сайте: DevTools → Application → Local Storage → ключ с access token.


`deploy/deploy-laravel.sh` — запасной ручной путь: composer install, миграции, кеши. Запускается в каталоге Laravel-приложения (обычно `/var/www/api`, `/home/gro7659365/growth-peak.pro/docs/backend` или `backend-laravel/`).


См. также `docker-compose.yml` для контейнерного запуска и `deploy/` для конфигов nginx / php-fpm.

Архив устаревших артефактов (legacy, Lovable Cloud) — `old/lovable-legacy/`.

