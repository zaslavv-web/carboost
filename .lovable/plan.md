## Цель

Сделать изолированную песочницу (sandbox) для разработки нового функционала, отделённую от боевого окружения. Любая фича сначала живёт в песочнице, и только после подтверждения переносится в прод.

Адрес песочницы: `https://growth-peak.pro/sandstorm`

## Архитектура

```text
GitHub
├── repo: career-track            → prod   → growth-peak.pro
└── repo: career-track-sandstorm  → sandbox → growth-peak.pro/sandstorm
```

Два независимых репозитория. Песочница — полная копия прода, но со своей БД, своим Laravel и своим фронтом. Никаких общих сервисов с продом.

### Инфраструктура на сервере

Один сервер, два изолированных стека через Docker Compose + nginx:

```text
nginx (host)
├── /            → prod  frontend (порт 8080)   → prod  laravel (порт 9000)  → prod  postgres
└── /sandstorm/  → sand  frontend (порт 8090)   → sand  laravel (порт 9100)  → sand  postgres
```

- Отдельные Docker-сети: `ct-prod-net`, `ct-sand-net`.
- Отдельные тома Postgres: `pgdata-prod`, `pgdata-sand`.
- Отдельные `.env` файлы: `backend-laravel/.env.production`, `backend-laravel/.env.sandstorm`.
- Префикс контейнеров: `ct-prod-*`, `ct-sand-*`.

### Фронт: работа под подпутём `/sandstorm`

- Vite build с `base: '/sandstorm/'` (через переменную окружения `VITE_BASE_PATH`).
- React Router с `basename={import.meta.env.BASE_URL}`.
- Все запросы к API идут через `VITE_LARAVEL_API_URL=/sandstorm/api`.
- Sandbox-баннер в шапке: жёлтая полоса «SANDBOX — данные могут быть удалены».

### Бэкенд: тот же код, другой `.env`

- Тот же `backend-laravel/`, но с переменной `APP_ENV=sandstorm`.
- Отдельная БД, отдельные миграции, отдельные секреты.
- SMTP в песочнице — тот же Яндекс, но письма уходят на `growthpeak+sand@yandex.ru` (или отключаются через `MAIL_MAILER=log`). Это решит пользователь при имплементации.

## Промоушен из песочницы в прод

```text
1. Разработка ведётся в repo career-track-sandstorm.
2. После проверки фичи в /sandstorm — создаём PR из sandstorm → prod.
3. Merge в prod = деплой на growth-peak.pro.
```

Технически перенос — обычный `git diff` между двумя репозиториями + ручной cherry-pick или скрипт `scripts/promote-to-prod.sh`, который:
- Считает diff между ветками `sandstorm/main` и `prod/main`.
- Создаёт PR в prod-репо с этим diff.
- НЕ переносит автоматически миграции, требующие ручного применения.

## Правило бэкапа

Ежедневный автоматический бэкап обеих БД и uploads:

```text
03:00 MSK  →  pg_dump prod      → s3://ct-backups/prod/YYYY-MM-DD.dump
03:15 MSK  →  pg_dump sandstorm → s3://ct-backups/sand/YYYY-MM-DD.dump
03:30 MSK  →  tar storage/app   → s3://ct-backups/files/YYYY-MM-DD.tar.gz
```

- Retention: 30 ежедневных, 12 ежемесячных.
- Хранение: внешнее S3-совместимое хранилище (выбор провайдера — на момент имплементации).
- Перед каждым промоушеном в прод — внеплановый бэкап прод-БД.
- Скрипт восстановления: `scripts/restore-backup.sh prod 2026-06-08`.

## Файлы, которые появятся

### Новые

- `scripts/promote-to-prod.sh` — diff + PR в prod-репо.
- `scripts/backup-db.sh` — pg_dump + загрузка в S3.
- `scripts/restore-backup.sh` — восстановление по дате.
- `scripts/sync-sandstorm-from-prod.sh` — обратная синхронизация (обновить песочницу свежими данными прода с маскировкой PII).
- `docker-compose.sandstorm.yml` — стек песочницы (web + laravel + postgres + redis с префиксом `ct-sand-`).
- `deploy/nginx.sandstorm.conf` — server-блок с location `/sandstorm/` и проксированием на ct-sand-laravel.
- `backend-laravel/.env.sandstorm.example` — шаблон env для песочницы.
- `.env.sandstorm.example` — фронтовый шаблон с `VITE_BASE_PATH=/sandstorm/` и `VITE_LARAVEL_API_URL=/sandstorm/api`.
- `DEPLOYMENT-SANDSTORM.md` — инструкция: как поднять, как промоутить, как бэкапить, как восстанавливать.
- `.github/workflows/backup.yml` — cron-воркфлоу ежедневного бэкапа (или systemd-таймер на сервере — выбор на имплементации).

### Изменяемые

- `vite.config.ts` — добавить `base: process.env.VITE_BASE_PATH ?? '/'`.
- `src/App.tsx` — `BrowserRouter basename={import.meta.env.BASE_URL}`.
- `src/components/AppLayout.tsx` (или корневой layout) — sandbox-баннер при `import.meta.env.VITE_APP_ENV === 'sandstorm'`.
- `deploy/nginx.conf` — добавить include для sandstorm-конфига.
- `Dockerfile` — пробросить `ARG VITE_BASE_PATH` и `ARG VITE_APP_ENV`.
- `docker-compose.yml` — только косметика (комментарий, что есть отдельный compose для sandstorm).
- `README.md` — короткий раздел про два окружения.

## Что НЕ делаем

- Не трогаем текущий прод-стек и его данные.
- Не делаем общую БД для прода и песочницы.
- Не автоматизируем merge в прод — он остаётся ручным (через PR-ревью).
- Не настраиваем общий SSO между прод и sandbox — пользователи независимые.
- Не меняем бизнес-логику приложения.

## Технические детали для имплементации

### nginx (упрощённо)

```nginx
server {
    server_name growth-peak.pro;
    root /var/www/prod;

    location /api/        { proxy_pass http://ct-prod-laravel:80; }
    location /sandstorm/  { alias /var/www/sandstorm/; try_files $uri $uri/ /sandstorm/index.html; }
    location /sandstorm/api/ {
        rewrite ^/sandstorm/api/(.*)$ /api/$1 break;
        proxy_pass http://ct-sand-laravel:80;
    }
    location / { try_files $uri $uri/ /index.html; }
}
```

### docker-compose.sandstorm.yml (структура)

```text
services:
  ct-sand-web        (фронт-сборка с VITE_BASE_PATH=/sandstorm/)
  ct-sand-laravel    (тот же образ, APP_ENV=sandstorm, .env.sandstorm)
  ct-sand-postgres   (отдельный том pgdata-sand)
  ct-sand-redis      (отдельный инстанс)
networks:
  ct-sand-net:
volumes:
  pgdata-sand:
```

### Бэкап (структура `backup-db.sh`)

```text
1. pg_dump --format=custom $DB_URL > /tmp/dump.bin
2. gpg --encrypt --recipient $BACKUP_KEY /tmp/dump.bin
3. aws s3 cp /tmp/dump.bin.gpg s3://ct-backups/$ENV/$(date +%F).dump.gpg
4. aws s3 ls и удаление того, что старше retention.
```

## Что нужно подтвердить перед стартом имплементации

- Где будут лежать бэкапы (S3-совместимое хранилище — какой провайдер).
- Как доставлять данные в песочницу при первом запуске: пустая БД или копия прод-БД с маскировкой PII.
- Что делать с почтой в песочнице: реальная отправка, отправка только на growthpeak@yandex.ru, или `log`-мейлер.
- Создаётся ли второй GitHub-репозиторий вручную пользователем, или мы используем ветку `sandstorm` в текущем репо (вариант с веткой проще, но менее изолирован).
