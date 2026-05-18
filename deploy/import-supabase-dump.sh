#!/usr/bin/env bash
# Импорт Supabase-дампа в продовый Laravel.
#
# Использование (на growth-peak.pro):
#   bash deploy/import-supabase-dump.sh /var/data/supabase-dump
#
# Каталог должен содержать JSON-файлы, выгруженные `supabase:dump` (см.
# /mnt/documents/supabase-migration/) + обязательный `_auth_users.json`
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
$PHP_BIN artisan down --message="Импорт данных Supabase" --retry=60 || true
trap '$PHP_BIN artisan up' EXIT

echo "==> supabase:import $DUMP_DIR"
$PHP_BIN artisan supabase:import "$DUMP_DIR"

echo "==> done. Проверь: SELECT count(*) FROM profiles;"
