# Дампы базы данных

Папка для бэкапов Postgres. Файлы вида `careertrack_public_YYYYMMDD_HHMMSS.dump`
(формат `pg_dump -Fc`) и `.sql` (plain SQL).

## Что внутри

Содержит **полную схему `public`** со всеми данными:
профили, роли, компании, должности, департаменты, цели, ассессменты,
карьерные треки, тесты, гамификация, магазин, опросники и т.д.

> Схемы `auth` и `storage` Supabase в этот дамп **не входят** — на них нет
> прав у sandbox-роли. Их нужно выгружать отдельно через сервисную роль
> Supabase, либо при миграции на чистый Laravel-стек экспортировать через
> владельца БД.

## Восстановление

```bash
# .dump (custom format) — рекомендуется
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "$DATABASE_URL" careertrack_public_YYYYMMDD_HHMMSS.dump

# .sql (plain)
psql "$DATABASE_URL" -f careertrack_public_YYYYMMDD_HHMMSS.sql
```

Перед загрузкой в чистую базу убедитесь, что созданы расширения
`pgcrypto` и `uuid-ossp` и схемы `auth`, `storage` (см.
`scripts/import-supabase-dump.sh`).
