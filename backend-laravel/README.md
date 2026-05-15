# Career Track — Laravel 11 backend

Этот каталог содержит **инфраструктуру и кастомный код** Laravel-бэка.
Сам каркас Laravel (vendor, bootstrap, базовые config-файлы) генерируется
командой `composer create-project` при первом подъёме — мы не коммитим
~500 файлов фреймворка в репозиторий.

## Стек

- PHP 8.3 + Laravel 11
- PostgreSQL 15 (тот же дамп, что был в Supabase)
- Sanctum — аутентификация SPA-токенами (совместима с bcrypt-паролями Supabase)
- Socialite — Google OAuth (линкует с существующими `auth.users` по email)
- Reverb — WebSocket-сервер для realtime
- Spatie/Permission — роли и права (импортируются из `public.user_roles`)
- Redis (predis) — кэш и очереди
- nginx + php-fpm в Docker

## Структура

```
backend-laravel/
├── docker/
│   ├── php-fpm/Dockerfile          # PHP 8.3-FPM + расширения (pdo_pgsql, redis, intl, gd...)
│   ├── nginx/default.conf          # nginx → php-fpm
│   └── reverb/Dockerfile           # отдельный контейнер под WebSockets
├── overlay/                        # Кастомный код, копируется поверх свежего Laravel
│   ├── app/                        # Models, Controllers, Policies, Services, Jobs, Events
│   ├── config/                     # sanctum.php, services.php, broadcasting.php (наши)
│   ├── database/migrations/        # формальные миграции поверх Supabase-дампа
│   ├── routes/api.php              # все API-эндпоинты
│   └── .env.example
├── scripts/
│   ├── bootstrap.sh                # composer create-project + установка пакетов + overlay
│   └── import-supabase-dump.sh     # перенос данных из старого Supabase Postgres
├── docker-compose.yml              # postgres + php-fpm + nginx + reverb + redis
└── README.md
```

## Первый запуск на VPS

```bash
# 1. Клонируем репозиторий, переходим в backend-laravel/
cd backend-laravel

# 2. Поднимаем инфраструктуру (postgres + redis)
cp overlay/.env.example .env
# отредактируйте .env: DB_PASSWORD, APP_KEY (php artisan key:generate), GOOGLE_CLIENT_ID/SECRET, AI_API_KEY
docker compose up -d postgres redis

# 3. Bootstrap Laravel + установка пакетов + overlay
bash scripts/bootstrap.sh

# 4. Импорт данных из старого Supabase
bash scripts/import-supabase-dump.sh /path/to/careertrack.dump

# 5. Поднимаем приложение
docker compose up -d
```

После этого:
- API доступно на `http://localhost:8000`
- Reverb WebSocket — `ws://localhost:8080`
- За nginx + Caddy/Traefik с TLS повесьте домен `api.example.ru → :8000`
  и `reverb.example.ru → :8080`.

## Дальнейшие фазы миграции

См. корневой [`.lovable/plan.md`](../.lovable/plan.md). Текущий статус: **Фаза 1**
(только инфраструктура и bootstrap). Эндпоинтов ещё нет — приходят в фазах 3–8.

## Важно

- Frontend (`src/`) **продолжает работать на старом Supabase** до Фазы 9. Этот бэк
  пока разрабатывается параллельно и не подключён к фронту.
- Песочница Lovable не запускает PHP. Все изменения проверяются вами на VPS.
