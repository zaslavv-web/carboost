# Проблема

`my.opprt@yandex.ru` на `/reset-password` получает «This password reset token is invalid». Это дословный ответ Laravel password broker, возвращается при: токен просрочен (дефолт 60 мин), уже использован, или email не совпадает с записью в `users`.

Прямого доступа к prod-логам у меня нет — нужна ваша помощь на шаге 1.

# Шаг 1. Диагностика на проде (вы или я по SSH)

```bash
php artisan tinker
>>> DB::table('password_reset_tokens')->where('email','my.opprt@yandex.ru')->get();
>>> DB::table('users')->whereRaw("LOWER(email)='my.opprt@yandex.ru'")->select('id','email','updated_at')->get();
```

- Нет строки в `password_reset_tokens` → токен уже использован или удалён.
- `created_at` старше 60 мин → просрочен.
- В `users.email` другой регистр → broker не находит строку.  
  
[gro7659365@gro7659365 backend]$ php artisan tinker
  Psy Shell v0.12.23 (PHP 8.2.31 — cli) by Justin Hileman
  New PHP manual is available (latest: 3.1.0). Update with `doc --update-manual`
  >
     PARSE ERROR  PHP Parse error: Syntax error, unexpected T_SR in vendor/psy/psysh/src/Exception/ParseErrorException.php on line 44.
  >
     PARSE ERROR  PHP Parse error: Syntax error, unexpected T_SR in vendor/psy/psysh/src/Exception/ParseErrorException.php on line 44.
  &nbsp;

# Шаг 2. Код-правки (делаю независимо от шага 1)

### Backend

1. `backend-laravel/config/auth.php` — `passwords.users.expire`: 60 → 180 (3 часа).
2. `PasswordResetController::reset`:
  - Различать `Password::INVALID_TOKEN` / `INVALID_USER` / `PASSWORD_RESET_THROTTLED`.
  - Возвращать `{ error_code, message }` со статусами 410/404/429 вместо общего 422.
  - `Log::warning('password reset failed', [...])` с email, причиной, IP — чтобы в `storage/logs/laravel.log` была история.
3. Новая artisan-команда `password:reset-status {email}` — печатает наличие записи, возраст, лимит. Для будущей диагностики без tinker.

### Frontend

4. `src/pages/ResetPassword.tsx`: на `error_code = token_invalid_or_expired` вместо toast показывать экран:
  - «Ссылка устарела или уже использована»
  - Кнопка «Запросить новую ссылку» → `/forgot-password?email=<prefill>`.
  - Сейчас пользователь видит только тост и зацикливается на той же форме.
5. `src/i18n/locales/{ru,en}/auth.json`: ключи `reset.expired`, `reset.alreadyUsed`, `reset.requestNew`, `reset.requestNewCta`.

# Что не меняю

- `forgot` flow и письмо (`ResetPasswordNotification`) — там лоуэркейс и URL уже корректные.
- Email-транспорт (Unisender Go) — письмо дошло, проблема не в доставке.
- Sanctum/sessions — не связаны с broker-токеном.

# Деливерабл

После шага 1 будет известна причина. Шаг 2 в любом случае убирает тупик: даже если пользователь снова кликнет старую ссылку, он получит понятный экран с кнопкой «запросить новую», а не красный тост.