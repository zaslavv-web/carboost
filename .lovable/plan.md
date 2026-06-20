## Настройка секретов для бэкапа в Yandex Object Storage

### Что делаем
Сохраняем 5 переменных в защищённое хранилище секретов Lovable Cloud, чтобы GitHub Action `backup.yml` и скрипт `scripts/backup-db.sh` могли подключаться к бакету `backups-b1g7homo3nmvgq4hnr8t`.

### Шаги

1. **Открыть защищённую форму** для ввода всех 5 секретов сразу (через `add_secret`):
   - `BACKUP_S3_BUCKET`
   - `BACKUP_S3_ENDPOINT`
   - `BACKUP_S3_REGION`
   - `BACKUP_S3_ACCESS_KEY_ID`
   - `BACKUP_S3_SECRET_ACCESS_KEY`

   Значения возьмёте из вашего сообщения и вставите в форму (она шифрует и не оставляет след в чате).

2. **Перенести те же значения в GitHub Secrets** репозитория (для workflow `.github/workflows/backup.yml`):
   - Settings → Secrets and variables → Actions → New repository secret
   - Создать те же 5 секретов с теми же именами.
   
   Это нужно отдельно, потому что GitHub Actions не имеет доступа к секретам Lovable Cloud.

3. **Перевыпустить ключ в Яндексе** (критично — текущий Secret Key скомпрометирован через чат):
   - Yandex Cloud Console → Сервисные аккаунты → `careertrack-backup` → Создать новый статический ключ
   - Удалить старый ключ (`YCAJEaj2nN5Xxxg4Eg52t920g`)
   - Обновить `BACKUP_S3_ACCESS_KEY_ID` и `BACKUP_S3_SECRET_ACCESS_KEY` в Lovable Cloud и GitHub через те же формы

4. **Проверить работу бэкапа**: запустить workflow вручную (Actions → Database Backup → Run workflow) и убедиться, что в бакете появился первый дамп.

### Что НЕ делаем
- Не редактируем код скрипта и workflow — они уже умеют читать эти переменные.
- Не храним секреты в `.env` или в репозитории.

### После одобрения плана
Переключусь в build mode и сразу открою защищённую форму `add_secret` для всех 5 переменных. Затем дам пошаговую инструкцию по GitHub Secrets и ротации ключа.
