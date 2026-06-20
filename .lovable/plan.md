## Запуск первого бэкапа

Со стороны кода менять ничего не нужно — workflow и скрипт уже на месте после прошлых правок. Нужны только действия в GitHub UI и разбор результата.

### Шаги

1. **Проверить, что все 8 секретов добавлены в GitHub** (Settings → Secrets and variables → Actions):
   - `BACKUP_SSH_HOST`
   - `BACKUP_SSH_USER`
   - `BACKUP_SSH_PASSWORD`
   - `BACKUP_S3_ENDPOINT` (например `https://storage.yandexcloud.net`)
   - `BACKUP_S3_BUCKET`
   - `BACKUP_S3_ACCESS_KEY_ID`
   - `BACKUP_S3_SECRET_ACCESS_KEY`
   - `BACKUP_GPG_PUBLIC_KEY`

2. **Запустить workflow вручную:**
   GitHub → вкладка **Actions** → слева **Daily DB Backup** → справа кнопка **Run workflow** → выбрать ветку `main`, параметр `env = prod` → **Run workflow**.

3. **Дождаться завершения** (~1–3 минуты). Открыть запуск, развернуть шаги.

4. **Прислать сюда вывод** — особенно красные шаги. Я разберу ошибку (вероятные места: имя docker-контейнера с Postgres, путь к `pg_dump`, права SSH-пользователя, формат S3 endpoint) и в build-режиме внесу точечную правку в `scripts/backup-db.sh` или `.github/workflows/backup.yml`.

5. **После зелёного запуска** — проверить, что в S3-бакете появился файл вида `career-track-YYYY-MM-DD.sql.gz.gpg`, и убедиться, что cron-расписание в workflow включено для ежедневного запуска.

### Что НЕ делаем сейчас
- Не трогаем код приложения.
- Не правим preventive `backup-db.sh` вслепую — ждём реальный лог, чтобы фиксить по факту.
