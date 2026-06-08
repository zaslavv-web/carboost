# Sandstorm — песочница Career Track

Документ описывает, как поднять, обслуживать и переносить функционал между
изолированной песочницей и продом.

## Принципы

- **Полная изоляция**. У песочницы своя БД, свой Redis, свой Laravel-стек, свой
  фронт-билд. Прод и песочница не делят данные.
- **Один сервер**. Оба окружения крутятся на одной машине, но в разных Docker-сетях
  (`ct-prod-net`, `ct-sand-net`) и с разными томами (`pgdata-prod`, `pgdata-sand`).
- **Один домен**. Хост-nginx раздаёт прод по `growth-peak.pro/` и песочницу по
  `growth-peak.pro/sandstorm/`.
- **Разработка → песочница → прод**. Любая фича сначала живёт в песочнице.
  В прод попадает только после ручного промоушена через PR.

## Архитектура

```text
GitHub
├── career-track            (prod-репо)      → growth-peak.pro
└── career-track-sandstorm  (sandbox-репо)   → growth-peak.pro/sandstorm

Server (один хост)
├── host-nginx (TLS)
│    ├── /            → ct-prod-web:8080  → ct-prod-laravel → pgdata-prod
│    └── /sandstorm/  → ct-sand-web:8090  → ct-sand-laravel → pgdata-sand
└── docker
     ├── docker-compose.yml              (prod-стек)
     └── docker-compose.sandstorm.yml    (sandbox-стек)
```

## Первый запуск песочницы

```bash
# 1. На сервере подготовьте env-файлы
cp .env.sandstorm.example .env.sandstorm
cp backend-laravel/.env.sandstorm.example backend-laravel/.env.sandstorm
# заполните секреты

# 2. Поднимите стек
docker compose -f docker-compose.sandstorm.yml --env-file .env.sandstorm up -d --build

# 3. Накатите миграции
docker compose -f docker-compose.sandstorm.yml exec ct-sand-laravel \
    php artisan migrate --force

# 4. Подключите nginx
sudo cp deploy/nginx.sandstorm.conf /etc/nginx/sites-available/growth-peak.pro
sudo ln -sf /etc/nginx/sites-available/growth-peak.pro /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

После этого `https://growth-peak.pro/sandstorm/` отдаёт фронт песочницы,
а `https://growth-peak.pro/sandstorm/api/...` — Laravel песочницы.

## Промоушен из песочницы в прод

Не автоматизируется через CI, чтобы предотвратить случайный деплой.

```bash
SAND_REPO=~/code/career-track-sandstorm \
PROD_REPO=~/code/career-track \
./scripts/promote-to-prod.sh
```

Скрипт:
1. Снимает diff.
2. Создаёт ветку `promote/<дата>` в прод-репо.
3. Открывает PR (если установлен `gh` cli).

Перед merge — обязательно ручной ревью миграций и побочных эффектов.

## Бэкапы

### Расписание

| Когда (UTC) | Что | Куда |
|---|---|---|
| 00:00 | pg_dump prod | `s3://ct-backups/prod/daily/` |
| 00:15 | pg_dump sandstorm | `s3://ct-backups/sandstorm/daily/` |
| 1-е число | копия в monthly/ | `s3://ct-backups/<env>/monthly/` |

Retention: 30 daily, 12 monthly.

### Запуск вручную

```bash
ENV=prod \
PG_DUMP_URL=postgres://... \
S3_BUCKET=ct-backups \
./scripts/backup-db.sh
```

### Через GitHub Actions

См. `.github/workflows/backup.yml`. Требует секреты:

- `PROD_PG_DUMP_URL`, `SAND_PG_DUMP_URL`
- `BACKUP_S3_BUCKET`, `BACKUP_AWS_REGION`
- `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY`
- `BACKUP_GPG_RECIPIENT` (опционально — fingerprint для шифрования)

### Перед каждым промоушеном в прод

```bash
ENV=prod PG_DUMP_URL=... S3_BUCKET=... ./scripts/backup-db.sh
```

### Восстановление

```bash
S3_BUCKET=ct-backups \
PG_RESTORE_URL=postgres://... \
./scripts/restore-backup.sh prod 2026-06-08
```

Скрипт спросит подтверждение `yes` перед перезаписью БД.

## Обновление песочницы свежими данными прода

```bash
PROD_PG_URL=postgres://...prod... \
SAND_PG_URL=postgres://...sand... \
./scripts/sync-sandstorm-from-prod.sh
```

Скрипт автоматически маскирует базовые PII: имена и email. При появлении новых
PII-полей в схеме — дополните блок `psql` в скрипте.

## Почта в песочнице

По умолчанию `MAIL_MAILER=log` — письма не уходят наружу, а складываются в
`storage/logs/laravel.log`. Это безопасно: тестовые рассылки не могут попасть к
реальным пользователям прода.

Если нужна реальная отправка — поменяйте в `backend-laravel/.env.sandstorm`:

```env
MAIL_MAILER=smtp
SMTP_PASSWORD=<app-password яндекса>
```

## Чек-лист безопасности

- [ ] Прод и sandbox используют разные OAuth credentials Google.
- [ ] У песочницы свой `APP_KEY` (не копируйте из прода).
- [ ] Бэкапы шифруются (`BACKUP_GPG_RECIPIENT` задан).
- [ ] `sync-sandstorm-from-prod.sh` дополнен маскировкой для всех PII-полей,
      которые есть в проекте на момент запуска.
- [ ] Доступ к S3-бакету с бэкапами ограничен IAM-политикой.
