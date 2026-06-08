#!/usr/bin/env bash
# Обновление БД песочницы свежим снимком прода с базовой маскировкой PII.
#
# Использование:
#   PROD_PG_URL=postgres://...prod... \
#   SAND_PG_URL=postgres://...sand... \
#   ./scripts/sync-sandstorm-from-prod.sh
#
# ВНИМАНИЕ: операция деструктивная для песочницы. Прод НЕ трогается.

set -euo pipefail

PROD_PG_URL="${PROD_PG_URL:?PROD_PG_URL is required}"
SAND_PG_URL="${SAND_PG_URL:?SAND_PG_URL is required}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DUMP="$TMP/prod.dump"

echo "[sync] pg_dump prod"
pg_dump --format=custom --no-owner --no-privileges "$PROD_PG_URL" > "$DUMP"

echo "[sync] восстановление в песочницу"
pg_restore --clean --if-exists --no-owner --no-privileges \
           --dbname="$SAND_PG_URL" "$DUMP"

echo "[sync] маскировка PII"
psql "$SAND_PG_URL" <<'SQL'
-- Базовая маскировка: имена/email/телефоны. Дополняйте по мере появления PII-полей.
UPDATE public.profiles
   SET full_name = 'User ' || substr(user_id::text, 1, 8),
       phone     = NULL
 WHERE user_id IS NOT NULL;

UPDATE auth.users
   SET email = 'sand+' || substr(id::text, 1, 8) || '@example.invalid',
       phone = NULL,
       raw_user_meta_data = '{}'::jsonb
 WHERE email NOT LIKE 'growthpeak@%';
SQL

echo "[sync] done"
