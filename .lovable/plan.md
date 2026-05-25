## Что известно

- Фронт получает `{"message":"Server Error"}` от `POST /api/admin/users`.
- Это стандартный ответ Laravel при `APP_DEBUG=false` — реальная ошибка скрыта и лежит **только в `backend-laravel/storage/logs/laravel.log` на сервере**.
- В коде `UsersController::store` 500 может прилететь из 3 мест (отправка письма обёрнута в try/catch, поэтому она 500 не даёт):
  1. `\DB::table('auth.users')->where('email', …)->exists()` — упадёт, если БД на проде **MySQL**, а не PostgreSQL (схемы `auth` нет).
  2. `AuthUserService::createWithPassword` → `INSERT INTO auth.users …` — то же самое + зависит от триггера `handle_new_user`, который автоматически создаёт `profiles` и `user_roles`. Если триггер слетел/не импортирован — `User::findOrFail($id)` упадёт.
  3. `\DB::table('profiles')->where('user_id', $actor->id)->value('company_id')` — для company_admin без профиля.

## План диагностики (отдать команде backend)

### Шаг 1 — достать реальный текст ошибки

На сервере выполнить:
```bash
tail -n 200 backend-laravel/storage/logs/laravel.log
```
и повторить попытку создания пользователя. В логе будет точный класс исключения, файл и строка. Без этого дальше — гадание.

Альтернатива на 5 минут: временно поставить в `backend-laravel/.env` на сервере `APP_DEBUG=true`, дёрнуть `php artisan config:clear`, повторить запрос — фронт увидит полный stack trace в ответе. **Сразу вернуть `APP_DEBUG=false`** — иначе утечка путей/секретов.

### Шаг 2 — проверить, что БД совпадает с кодом

Код в `AuthUserService::createWithPassword` пишет SQL `INSERT INTO auth.users …` — это **только PostgreSQL** (схема `auth.*` из Supabase). На MySQL это гарантированно 500. Подтвердить:
```bash
cd backend-laravel && php artisan tinker --execute="echo DB::getDriverName().PHP_EOL;"
```
Если `mysql` — нужно либо мигрировать прод на Postgres, либо переписать сервис под `public.users`. Это уже отдельная задача.

### Шаг 3 — если БД Postgres, проверить наличие триггера и схемы

```sql
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='auth' AND c.relname='users';

SELECT tgname FROM pg_trigger WHERE tgname='on_auth_user_created';
```
Если триггера `handle_new_user` нет — пере-импортировать его из дампа Supabase (он создаёт `profiles` + `user_roles` после INSERT в `auth.users`).

### Шаг 4 — проверить, что у самого суперадмина есть профиль

Если запрос идёт от company_admin без записи в `profiles`, `$companyId` будет `null` → выдаст 422 (не 500), но если профиля нет у суперадмина — `$actor->companyId()` тоже не упадёт. Тут ок, но стоит проверить ради полноты:
```sql
SELECT user_id, company_id FROM public.profiles WHERE user_id = '<id суперадмина>';
```

## Что НЕ делать

- Не менять код вслепую до получения текста из `laravel.log` — иначе сломаем что-то ещё.
- Не путать с предыдущей ошибкой APP_KEY: отправка письма не валит 500 (`try/catch` в контроллере), это другая проблема.

## Итог

Без `laravel.log` или `APP_DEBUG=true` диагноз поставить нельзя — нужен текст исключения. После шага 1 будет понятно, чинить ли БД (шаг 2/3) или это что-то ещё.