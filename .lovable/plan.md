## Переход с AWS CLI на rclone (S3-совместимое хранилище)

Убираем зависимость от AWS как вендора. `rclone` — open-source утилита (Go), доступна в `apt` Ubuntu Noble, работает с любым S3-совместимым хранилищем: Yandex Object Storage, Selectel, VK Cloud, Cloud.ru, MinIO on-prem.

### 1. `.github/workflows/backup.yml`

**Шаг Install deps** — убрать `awscli`, добавить `rclone`:
```yaml
sudo apt-get install -y postgresql-client gnupg rclone
```

**Шаг Run backup** — заменить блок `env` (убрать `AWS_*`, добавить `RCLONE_CONFIG_S3_*`):
```yaml
env:
  ENV: ${{ steps.env.outputs.ENV }}
  PG_DUMP_URL: ${{ steps.env.outputs.ENV == 'prod' && secrets.PROD_PG_DUMP_URL || secrets.SAND_PG_DUMP_URL }}
  S3_BUCKET: ${{ secrets.BACKUP_S3_BUCKET }}
  RCLONE_CONFIG_S3_TYPE: s3
  RCLONE_CONFIG_S3_PROVIDER: Other
  RCLONE_CONFIG_S3_ACCESS_KEY_ID: ${{ secrets.BACKUP_S3_ACCESS_KEY_ID }}
  RCLONE_CONFIG_S3_SECRET_ACCESS_KEY: ${{ secrets.BACKUP_S3_SECRET_ACCESS_KEY }}
  RCLONE_CONFIG_S3_REGION: ${{ secrets.BACKUP_S3_REGION }}
  RCLONE_CONFIG_S3_ENDPOINT: ${{ secrets.BACKUP_S3_ENDPOINT }}
  BACKUP_GPG_RECIPIENT: ${{ secrets.BACKUP_GPG_RECIPIENT }}
```

### 2. `scripts/backup-db.sh`

Заменить три команды AWS CLI и обновить комментарии в шапке:

| Было | Стало |
|---|---|
| `aws s3 cp "$UPLOAD_PATH" "s3://$BUCKET/$KEY"` | `rclone copyto "$UPLOAD_PATH" "s3:$BUCKET/$KEY"` |
| `aws s3 ls "s3://$BUCKET/$PREFIX/" \| awk '{print $4}'` | `rclone lsf "s3:$BUCKET/$PREFIX/"` |
| `aws s3 rm "s3://$BUCKET/$KEY"` | `rclone deletefile "s3:$BUCKET/$KEY"` |

### 3. Секреты в GitHub Actions (Settings → Secrets and variables → Actions)

**Удалить** (старые AWS-имена):
- `BACKUP_AWS_ACCESS_KEY_ID`
- `BACKUP_AWS_SECRET_ACCESS_KEY`
- `BACKUP_AWS_REGION`

**Добавить** (новые S3-нейтральные):

| Имя секрета | Значение | Пример |
|---|---|---|
| `BACKUP_S3_ACCESS_KEY_ID` | Access key вашего S3-хранилища | `YCAJEabc...` (Yandex) |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret key | `YCN...` |
| `BACKUP_S3_REGION` | Регион | `ru-central1` (Yandex) / `ru-1` (Selectel) / `ru-msk` (VK) |
| `BACKUP_S3_ENDPOINT` | URL S3-эндпоинта | Yandex: `https://storage.yandexcloud.net`<br>Selectel: `https://s3.storage.selcloud.ru`<br>VK Cloud: `https://hb.vkcs.cloud`<br>Cloud.ru: `https://s3.cloud.ru` |

**Остаются как есть:**
- `BACKUP_S3_BUCKET` — имя бакета
- `PROD_PG_DUMP_URL`, `SAND_PG_DUMP_URL` — строки подключения к Postgres
- `BACKUP_GPG_RECIPIENT` — fingerprint GPG-ключа (опционально)

### 4. Проверка после применения
1. В GitHub репозитория добавить 4 новых секрета (см. таблицу выше).
2. Actions → Daily DB Backup → Run workflow → выбрать `sandstorm` → запустить.
3. Убедиться, что в S3-бакете появился файл `sandstorm/daily/sandstorm-YYYY-MM-DD.dump[.gpg]`.
4. После успешного прогона удалить старые `BACKUP_AWS_*` секреты.

### Что меняется в самих файлах проекта
- `.github/workflows/backup.yml` — отредактирован (apt-пакет + env-блок).
- `scripts/backup-db.sh` — отредактирован (3 команды + комментарии в шапке).
- Других файлов не трогаем.
