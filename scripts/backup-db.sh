#!/usr/bin/env bash
# Ежедневный бэкап Postgres-БД (прод или песочница) с загрузкой
# в S3-совместимое хранилище через rclone.
#
# Поддерживаются любые S3-совместимые провайдеры:
# Yandex Object Storage, Selectel, VK Cloud, Cloud.ru, MinIO on-prem и т.д.
#
# Использование:
#   ENV=prod      ./scripts/backup-db.sh
#   ENV=sandstorm ./scripts/backup-db.sh
#
# Требуемые переменные окружения:
#   ENV                                 — prod | sandstorm
#   PG_DUMP_URL                         — postgres://user:pass@host:port/dbname
#   S3_BUCKET                           — например ct-backups
#   S3_PREFIX                           — опционально, иначе $ENV
#   RCLONE_CONFIG_S3_TYPE=s3            — фиксировано
#   RCLONE_CONFIG_S3_PROVIDER           — Other / Yandex / Minio / ...
#   RCLONE_CONFIG_S3_ACCESS_KEY_ID      — access key хранилища
#   RCLONE_CONFIG_S3_SECRET_ACCESS_KEY  — secret key хранилища
#   RCLONE_CONFIG_S3_REGION             — регион (например ru-central1)
#   RCLONE_CONFIG_S3_ENDPOINT           — URL S3-эндпоинта
#   BACKUP_GPG_RECIPIENT                — опционально, fingerprint для gpg --encrypt
#
# Retention: 30 ежедневных, 12 ежемесячных (1-е число месяца сохраняется отдельно).

set -euo pipefail

ENV="${ENV:?ENV is required (prod|sandstorm)}"
PG_DUMP_URL="${PG_DUMP_URL:?PG_DUMP_URL is required}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
S3_PREFIX="${S3_PREFIX:-$ENV}"

DATE="$(date -u +%F)"
DAY_OF_MONTH="$(date -u +%d)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DUMP_PATH="$TMP_DIR/${ENV}-${DATE}.dump"
echo "[backup] pg_dump → $DUMP_PATH"
pg_dump --format=custom --no-owner --no-privileges "$PG_DUMP_URL" > "$DUMP_PATH"

UPLOAD_PATH="$DUMP_PATH"
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  echo "[backup] gpg --encrypt"
  gpg --batch --yes --trust-model always \
      --recipient "$BACKUP_GPG_RECIPIENT" \
      --output "${DUMP_PATH}.gpg" --encrypt "$DUMP_PATH"
  UPLOAD_PATH="${DUMP_PATH}.gpg"
fi

DAILY_KEY="${S3_PREFIX}/daily/$(basename "$UPLOAD_PATH")"
echo "[backup] upload → s3:${S3_BUCKET}/${DAILY_KEY}"
rclone copyto "$UPLOAD_PATH" "s3:${S3_BUCKET}/${DAILY_KEY}"

# Ежемесячная копия — первого числа каждого месяца дублируем в monthly/.
if [[ "$DAY_OF_MONTH" == "01" ]]; then
  MONTHLY_KEY="${S3_PREFIX}/monthly/$(basename "$UPLOAD_PATH")"
  echo "[backup] monthly copy → s3:${S3_BUCKET}/${MONTHLY_KEY}"
  rclone copyto "$UPLOAD_PATH" "s3:${S3_BUCKET}/${MONTHLY_KEY}"
fi

# Retention: чистим daily старше 30 дней, monthly старше 12 месяцев.
CUTOFF_DAILY="$(date -u -d '30 days ago' +%F)"
CUTOFF_MONTHLY="$(date -u -d '365 days ago' +%F)"

cleanup() {
  local prefix="$1"
  local cutoff="$2"
  rclone lsf "s3:${S3_BUCKET}/${S3_PREFIX}/${prefix}/" 2>/dev/null | while read -r key; do
    [[ -z "$key" ]] && continue
    # Имя файла: <env>-YYYY-MM-DD.dump[.gpg]
    file_date="$(echo "$key" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -n1)"
    [[ -z "$file_date" ]] && continue
    if [[ "$file_date" < "$cutoff" ]]; then
      echo "[backup] retention: remove ${prefix}/${key}"
      rclone deletefile "s3:${S3_BUCKET}/${S3_PREFIX}/${prefix}/${key}"
    fi
  done
}

cleanup daily "$CUTOFF_DAILY"
cleanup monthly "$CUTOFF_MONTHLY"

echo "[backup] done"
