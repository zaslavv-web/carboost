#!/usr/bin/env bash
# Импорт legacy-дампа в продовый Laravel.
#
# Использование (на growth-peak.pro):
#   bash deploy/import-legacy-dump.sh /var/data/legacy-dump
#
# Каталог должен содержать JSON-файлы, выгруженные `legacy:dump` (см.
# /mnt/documents/legacy-migration/) + обязательный `_auth_users.json`
# (вручную выгруженный SQL, см. MIGRATION.md).

set -euo pipefail

DUMP_DIR="${1:-}"
APP_DIR="${APP_DIR:-/var/www/api}"
PHP_BIN="${PHP_BIN:-php}"

[ -n "$DUMP_DIR" ] || { echo "Usage: $0 <dump-dir>"; exit 1; }
[ -d "$DUMP_DIR" ] || { echo "FATAL: $DUMP_DIR не существует"; exit 1; }
[ -f "$DUMP_DIR/_auth_users.json" ] || {
  echo "WARN: $DUMP_DIR/_auth_users.json не найден — юзеры не будут импортированы";
}

cd "$APP_DIR"
$PHP_BIN artisan down --message="Импорт данных legacy" --retry=60 || true
trap '$PHP_BIN artisan up' EXIT

echo "==> legacy:import $DUMP_DIR"
$PHP_BIN artisan legacy:import "$DUMP_DIR"

echo "==> done. Проверь: SELECT count(*) FROM profiles;"
