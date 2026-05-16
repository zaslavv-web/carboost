#!/usr/bin/env bash
# Восстанавливает дамп Supabase в локальный/удалённый Postgres Laravel-стека.
#
# Использование:
#   bash scripts/import-supabase-dump.sh /path/to/careertrack.dump
#
# Требуется установленный psql/pg_restore. Параметры подключения берутся из .env
# (DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD).
#
# Дамп должен быть получен через:
#   pg_dump --schema=public --schema=auth --schema=storage \
#           --no-owner --no-privileges -Fc -f careertrack.dump $LOVABLE_DB_URL

set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:?Путь к .dump файлу обязателен}"
[ -f "$DUMP" ] || { echo "Файл $DUMP не найден"; exit 1; }

# shellcheck disable=SC1091
source .env

export PGHOST="${DB_HOST:-127.0.0.1}"
export PGPORT="${DB_PORT:-5432}"
export PGDATABASE="${DB_DATABASE:-careertrack}"
export PGUSER="${DB_USERNAME:-careertrack}"
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set in .env}"

echo "==> Создаём схемы auth и storage и роли-алиасы (если нет)"
psql <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
DO $$ BEGIN CREATE ROLE supabase_admin;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_auth_admin;     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_storage_admin;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator;           EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon;                    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated;           EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SQL

echo "==> Накатываем дамп (это может занять несколько минут)"
pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  -d "$PGDATABASE" \
  "$DUMP"

echo "==> Проверяем, что данные на месте"
psql -c "
  SELECT 'auth.users' AS table, COUNT(*) FROM auth.users
  UNION ALL SELECT 'public.profiles',   COUNT(*) FROM public.profiles
  UNION ALL SELECT 'public.companies',  COUNT(*) FROM public.companies
  UNION ALL SELECT 'public.user_roles', COUNT(*) FROM public.user_roles;
"

echo "==> Готово. Пользователи и bcrypt-пароли перенесены."
echo "    Активные сессии не переносятся — все юзеры должны войти заново."
