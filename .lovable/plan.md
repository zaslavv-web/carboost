## Цель

Переделать бэкап под реальную инфраструктуру: Laravel + PostgreSQL в Docker на nic.ru VPS, GitHub Actions ходит на сервер по SSH и забирает дамп.

## Архитектура

```text
GitHub Actions runner
  │  ssh gro7659365@ssh.gro7659365.nichost.ru
  ▼
VPS nic.ru
  └─ Docker
       ├─ postgres        ← prod БД careertrack
       └─ ct-sand-postgres ← sandbox БД careertrack_sand
```

Runner запускает `docker exec ... pg_dump` через SSH, дамп стримится по pipe обратно в runner, шифруется GPG публичным ключом, загружается rclone в Yandex Object Storage.

## Изменения в коде

### 1. `scripts/backup-db.sh` — переписать
- Убрать переменную `PG_DUMP_URL`.
- Добавить переменные: `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `DOCKER_CONTAINER`, `DB_USER`, `DB_NAME`.
- Команда дампа:
  ```bash
  sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=accept-new \
      "$SSH_USER@$SSH_HOST" \
      "docker exec -i $DOCKER_CONTAINER pg_dump --format=custom --no-owner --no-privileges -U $DB_USER $DB_NAME" \
      > "$DUMP_PATH"
  ```
- Остальная логика (GPG, rclone, retention 30 daily / 12 monthly) — без изменений.

### 2. `.github/workflows/backup.yml`
- Установить `sshpass` дополнительно к существующим пакетам.
- В шаг `Run backup` пробросить новые env-переменные вместо `PG_DUMP_URL`:
  - `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`
  - `DOCKER_CONTAINER` (`postgres` для prod, `ct-sand-postgres` для sandstorm)
  - `DB_USER=careertrack`
  - `DB_NAME` (`careertrack` или `careertrack_sand`)

### 3. `scripts/restore-backup.sh` (если есть) — обновить
Аналогично переписать на SSH-схему. Проверю файл и обновлю, если он использует прямое подключение.

## Что вам сделать в GitHub Secrets

Зайти **Settings → Secrets and variables → Actions → New repository secret** и создать:

| Секрет | Значение | Откуда |
|---|---|---|
| `BACKUP_SSH_HOST` | `ssh.gro7659365.nichost.ru` | уже знаем |
| `BACKUP_SSH_USER` | `gro7659365` | уже знаем |
| `BACKUP_SSH_PASSWORD` | пароль от SSH | из письма/кабинета nic.ru |
| `BACKUP_S3_SECRET_ACCESS_KEY` | secret key Yandex Object Storage | Yandex Cloud → Service Accounts → Static keys |
| `BACKUP_GPG_RECIPIENT` | `backup@career-track` | вы придумываете при генерации |
| `BACKUP_GPG_PUBLIC_KEY` | вывод `gpg --export --armor backup@career-track` | сгенерировать локально |

Уже добавлены ранее: `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`.

**Больше не нужны** (удалю упоминания из workflow): `PROD_PG_DUMP_URL`, `SAND_PG_DUMP_URL`.

## Открытые вопросы — проверка после первого запуска

1. **Имена Docker-контейнеров** — взяты из `backend-laravel/.env*`: `postgres` (prod) и `ct-sand-postgres` (sandstorm). Если на сервере они называются иначе — первый запуск покажет, поправлю одной строкой.
2. **Docker на nic.ru** — проверим первым же запуском. Если nic.ru-тариф не поддерживает Docker (бывает на shared-хостинге), переключим план на «PostgreSQL установлен напрямую на VPS» — `pg_dump` вызовется без `docker exec`.
3. **sshpass vs SSH-ключ** — пароль работает, но менее безопасно. Через 1-2 недели рекомендую переехать на SSH-ключ (сгенерируете, добавите его публичную часть в `~/.ssh/authorized_keys` на VPS, приватную — в GitHub Secret).

## Как сгенерировать GPG-ключ

Если GPG ещё не установлен: Mac — `brew install gnupg`, Windows — Gpg4win.

```bash
gpg --quick-generate-key "backup@career-track" rsa4096 encrypt 2y
gpg --export --armor backup@career-track            # → BACKUP_GPG_PUBLIC_KEY
gpg --export-secret-keys --armor backup@career-track  # → в 1Password
```

## Проверка после внедрения

После добавления секретов: **Actions → Daily DB Backup → Run workflow → env: prod**. Ожидаемые строки в логе:
```
[backup] ssh + docker exec pg_dump → ...
[backup] gpg --encrypt
[backup] upload → s3:.../prod/daily/prod-YYYY-MM-DD.dump.gpg
```
