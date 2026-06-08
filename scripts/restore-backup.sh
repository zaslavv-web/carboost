#!/usr/bin/env bash
# Восстановление БД из бэкапа.
#
# Использование:
#   ./scripts/restore-backup.sh <env> <YYYY-MM-DD>
#
# Пример:
#   ./scripts/restore-backup.sh prod 2026-06-08
#
# ВНИМАНИЕ: операция деструктивная — целевая БД полностью перезаписывается.
# Перед запуском обязательно сделайте дополнительный pg_dump текущего состояния.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <env> <YYYY-MM-DD>"
  exit 1
fi

ENV="$1"
DATE="$2"

S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
S3_PREFIX="${S3_PREFIX:-$ENV}"
PG_RESTORE_URL="${PG_RESTORE_URL:?PG_RESTORE_URL is required (postgres://...)}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Пробуем сначала зашифрованную копию, потом обычную.
for suffix in ".dump.gpg" ".dump"; do
  KEY="s3://${S3_BUCKET}/${S3_PREFIX}/daily/${ENV}-${DATE}${suffix}"
  LOCAL="$TMP_DIR/${ENV}-${DATE}${suffix}"
  if aws s3 cp "$KEY" "$LOCAL" 2>/dev/null; then
    FOUND="$LOCAL"
    break
  fi
done

if [[ -z "${FOUND:-}" ]]; then
  echo "Бэкап ${ENV}-${DATE} не найден в s3://${S3_BUCKET}/${S3_PREFIX}/daily/"
  exit 2
fi

if [[ "$FOUND" == *.gpg ]]; then
  echo "[restore] gpg --decrypt"
  gpg --batch --yes --output "${FOUND%.gpg}" --decrypt "$FOUND"
  FOUND="${FOUND%.gpg}"
fi

read -r -p "Реально перезаписать БД из $FOUND? (введите 'yes'): " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Отмена."; exit 3; }

echo "[restore] pg_restore"
pg_restore --clean --if-exists --no-owner --no-privileges \
           --dbname="$PG_RESTORE_URL" "$FOUND"

echo "[restore] done"
