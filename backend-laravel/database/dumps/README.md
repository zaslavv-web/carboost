# Дампы базы данных

## Файлы

- `careertrack_public_*.dump` / `.sql` — Postgres (родной формат Supabase, `pg_dump -Fc` и plain SQL).
- `careertrack_mysql_*.sql` — **MySQL 8 дамп** схемы `public`, сконвертированный из Postgres.
- `*.zip` — те же файлы в архиве.

## MySQL дамп

Содержит 45 таблиц схемы `public` с данными. Маппинг типов:

| Postgres | MySQL |
|---|---|
| `uuid` | `CHAR(36)` |
| `text` | `LONGTEXT` |
| `jsonb` / `json` | `JSON` |
| `timestamp[tz]` | `DATETIME(6)` |
| `boolean` | `TINYINT(1)` |
| `numeric(p,s)` | `DECIMAL(p,s)` |
| `text[]` и др. массивы | `JSON` (массив элементов) |
| `bytea` | `LONGBLOB` |
| `USER-DEFINED` (enum) | `VARCHAR(64)` |

### Что НЕ перенесено в MySQL дамп

- Схемы `auth` и `storage` Supabase (нет прав, плюс это GoTrue/Storage специфика — в Laravel-стеке заменяются на Sanctum + локальный/S3 storage).
- RLS-политики, триггеры, функции, последовательности, view — это Postgres-only. Логика реализована в Laravel Policies/Models.
- Внешние ключи опущены (отключены `FOREIGN_KEY_CHECKS`), чтобы порядок INSERT не имел значения. При желании добавьте их после импорта.

### Восстановление в MySQL

```bash
mysql -u root -p -e "CREATE DATABASE careertrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p careertrack < careertrack_mysql_YYYYMMDD_HHMMSS.sql
```

В Laravel `.env`:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=careertrack
DB_USERNAME=careertrack
DB_PASSWORD=...
```

> ⚠️ Пароли пользователей в `auth.users` (bcrypt от Supabase GoTrue) **не входят** в MySQL дамп. После миграции на MySQL все юзеры должны зарегистрироваться/войти через сброс пароля.

## Postgres дамп (для миграции 1-в-1)

```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "$DATABASE_URL" careertrack_public_YYYYMMDD_HHMMSS.dump
```

Подробнее см. `scripts/import-supabase-dump.sh`.
