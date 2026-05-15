#!/usr/bin/env bash
# Восстанавливает дамп Supabase в свежий Postgres Laravel-стека.
#
# Использование:
#   bash scripts/import-supabase-dump.sh /path/to/careertrack.dump
#
# Дамп должен быть получен через:
#   pg_dump --schema=public --schema=auth --schema=storage \
#           --no-owner --no-privileges -Fc -f careertrack.dump $LOVABLE_DB_URL

set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:?Путь к .dump файлу обязателен}"
[ -f "$DUMP" ] || { echo "Файл $DUMP не найден"; exit 1; }

source .env

CONTAINER="ct-laravel-postgres"
DB="${DB_DATABASE:-careertrack}"
USER="${DB_USERNAME:-careertrack}"

echo "==> Создаём схемы auth и storage если нет"
docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" <<SQL
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
-- Создаём роли, на которые ссылается дамп Supabase, как алиасы текущего юзера
DO \$\$ BEGIN
  CREATE ROLE supabase_admin;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE supabase_auth_admin;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE supabase_storage_admin;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE authenticator;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE anon;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE service_role;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
SQL

echo "==> Накатываем дамп (это может занять несколько минут)"
docker exec -i "$CONTAINER" pg_restore \
  -U "$USER" -d "$DB" \
  --clean --if-exists --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  < "$DUMP"

echo "==> Проверяем, что данные на месте"
docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -c "
  SELECT 'auth.users' AS table, COUNT(*) FROM auth.users
  UNION ALL SELECT 'public.profiles', COUNT(*) FROM public.profiles
  UNION ALL SELECT 'public.companies', COUNT(*) FROM public.companies
  UNION ALL SELECT 'public.user_roles', COUNT(*) FROM public.user_roles;
"

echo "==> Готово. Пользователи и пароли (bcrypt) перенесены."
echo "    Активные сессии не переносятся — все юзеры должны войти заново."
