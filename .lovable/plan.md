## Цель

Привести `.github/workflows/backup.yml` в рабочее состояние с новыми ключами Yandex и схемой «GPG-шифрование, приватный ключ в 1Password». Sandstorm-ветку не трогаем.

## Что меняется в коде

### 1. `.github/workflows/backup.yml`

Между шагом `Install deps` и `Run backup` добавляется новый шаг **Import GPG public key**: если `BACKUP_GPG_PUBLIC_KEY` задан, он импортируется в keyring раннера через `gpg --import`, иначе шаг скипается. Без этого шага текущий скрипт падает на `gpg --encrypt`, потому что в чистом раннере нет ключа с нужным recipient.

В шаг `Run backup` также прокидывается `BACKUP_GPG_PUBLIC_KEY` как env — на случай fallback-импорта внутри скрипта.

### 2. `scripts/backup-db.sh`

Минимальная правка: перед вызовом `gpg --encrypt` проверяем, что ключ с данным recipient присутствует в keyring. Если нет — `gpg --import` из переменной `BACKUP_GPG_PUBLIC_KEY` (если она задана), иначе понятная ошибка `BACKUP_GPG_RECIPIENT задан, но публичный ключ не найден`. Это делает скрипт самодостаточным (его можно запускать локально).

### 3. Sandstorm

Файлы не трогаются по вашему запросу. `SAND_PG_DUMP_URL` остаётся обязательным секретом для ночного крона в 03:15 МСК. Если sandstorm-БД сейчас не существует, ночной запуск будет красным — это ожидаемо до прояснения.

## Что вам нужно сделать на стороне GitHub

Перейти в **Repo → Settings → Secrets and variables → Actions → New repository secret** и добавить/обновить:

| Секрет | Где взять | Статус |
|---|---|---|
| `BACKUP_S3_BUCKET` | Yandex Object Storage → имя бакета | ✅ уже есть |
| `BACKUP_S3_ENDPOINT` | `https://storage.yandexcloud.net` | ✅ уже есть |
| `BACKUP_S3_REGION` | `ru-central1` | ✅ уже есть |
| `BACKUP_S3_ACCESS_KEY_ID` | Yandex → Static access keys | ✅ уже есть |
| `BACKUP_S3_SECRET_ACCESS_KEY` | парный к access key (показывается один раз при создании) | ⚠️ нужно добавить |
| `PROD_PG_DUMP_URL` | Lovable → Backend → Database → Connection string (Session pooler) | ⚠️ нужно добавить |
| `SAND_PG_DUMP_URL` | connection string sandbox-БД (если её нет — оставить пустым, ночной 03:15 будет падать) | ⚠️ нужно добавить или принять падение крона |
| `BACKUP_GPG_RECIPIENT` | email/fingerprint вашего GPG-ключа | ⚠️ нужно добавить |
| `BACKUP_GPG_PUBLIC_KEY` | вывод `gpg --export --armor <email>` целиком (вместе с `-----BEGIN PGP PUBLIC KEY BLOCK-----`) | ⚠️ нужно добавить |

Приватный GPG-ключ в GitHub **не кладём** — он живёт в 1Password и нужен только при восстановлении из бэкапа (вручную, локально).

## Как сгенерировать GPG-ключ

```bash
gpg --quick-generate-key "backup@career-track" rsa4096 encrypt 2y
gpg --export --armor backup@career-track       # → значение BACKUP_GPG_PUBLIC_KEY
gpg --export-secret-keys --armor backup@career-track  # → в 1Password
# recipient = backup@career-track → значение BACKUP_GPG_RECIPIENT
```

## Перевыпуск ключа в будущем

1. Сгенерировать новую пару, новый приватный сохранить в 1Password рядом со старым.
2. Обновить `BACKUP_GPG_PUBLIC_KEY` и `BACKUP_GPG_RECIPIENT` в GitHub Secrets.
3. Старые бэкапы по-прежнему дешифруются старым приватным ключом из 1Password.

## Проверка после внедрения

Запустить workflow вручную: **Actions → Daily DB Backup → Run workflow → env: prod**. Успешный прогон должен показать в логах `[backup] gpg --encrypt` и `[backup] upload → s3:...`.
