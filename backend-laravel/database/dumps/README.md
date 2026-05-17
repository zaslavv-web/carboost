# Дампы базы данных Career Track

## Актуальный набор (MySQL + Laravel migrations)

Подход: **схема создаётся миграциями Laravel**, данные подгружаются отдельным
INSERT-дампом.

### 1. Схема — `backend-laravel/database/migrations/`

- `0001_01_01_000001…000005` — служебные таблицы Laravel
  (Sanctum personal_access_tokens, sessions/cache/jobs, Spatie permissions, impersonation_audit).
- `0002_00_00_000000_create_users_table.php` — `public.users`
  (перенос `auth.users` из Supabase: email, password (bcrypt), email_verified_at, meta, remember_token).
- `0002_00_01…0002_00_45_*` — по одной миграции на каждую из 45 таблиц `public.*`,
  сгенерированы автоматически из схемы Supabase Postgres.

Запуск:
```bash
cd backend-laravel
cp .env.example .env
# в .env: DB_CONNECTION=mysql, DB_DATABASE=careertrack и т.д.
php artisan migrate
```

### 2. Данные — `careertrack_data_<TS>.sql` (+ .zip)

INSERT-ы для `users` и всех 45 таблиц `public.*`, в кодировке utf8mb4.
Используется ПОСЛЕ `php artisan migrate`:

```bash
mysql -u root -p careertrack < careertrack_data_20260517_083114.sql
```

### ⚠️ Пароли пользователей

bcrypt-хеши **НЕ переносятся** в этот дамп — Supabase Admin API их не отдаёт
(security by design). В дампе `users.password = NULL` для всех 16 учёток.

Варианты восстановления:

**A. Перенести хеши из исходной БД** (если есть admin-доступ к Postgres Supabase):
```sql
-- На стороне Supabase Postgres (роль с доступом к schema auth):
SELECT id, encrypted_password FROM auth.users;
-- Сохранить как CSV, импортировать в MySQL и:
UPDATE users u JOIN tmp_pwd t ON u.id=t.id SET u.password=t.encrypted_password;
```

**B. Принудительный сброс паролей** (если admin-доступа нет):
- Отправить всем пользователям ссылку «установить новый пароль» через
  `POST /api/auth/forgot-password` (Laravel password broker).
- До установки пароля логин/пароль не работает — только OAuth (Google).

## Архивные дампы (Postgres / старый MySQL)

Эти файлы оставлены для справки, но **в работе использовать не нужно**:

- `careertrack_public_20260516_124825.{dump,sql,zip}` — pg_dump схемы public (PostgreSQL).
- `careertrack_mysql_20260516_140607.{sql,zip}` — предыдущий MySQL-дамп, включавший
  CREATE TABLE (теперь заменены миграциями Laravel).
