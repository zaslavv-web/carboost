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

В дампе **bcrypt-хеши перенесены как есть** из исходной БД. Laravel читает
bcrypt нативно — после импорта юзеры заходят со своими старыми паролями
без сброса.

Из 16 «боевых» учёток:
- **10** имеют bcrypt-пароль (вход email + password).
- **6** созданы через Google OAuth (`password = NULL`) — им нужно либо логиниться
  через Google, либо сбросить пароль через `POST /api/auth/forgot-password`.

### 🧪 Тестовые пользователи

В конец дампа добавлены 5 тестовых учёток (по одной на каждую роль). Пароль
у всех **одинаковый: `password123`**. Компания —
`a0000000-0000-0000-0000-000000000001` («Компания по умолчанию»),
`is_verified = 1`, готовы к входу сразу после импорта дампа.

| Email                     | Роль            |
|---------------------------|-----------------|
| `employee@test.local`     | employee        |
| `manager@test.local`      | manager         |
| `hrd@test.local`          | hrd             |
| `admin@test.local`        | company_admin   |
| `superadmin@test.local`   | superadmin      |
