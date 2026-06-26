## Проблема 1: восстановление пароля падает с SMTP-ошибкой

`PasswordResetController::forgot` (backend-laravel/app/Http/Controllers/Api/Auth/PasswordResetController.php) безусловно вызывает:
- `autoRepairActiveSettings()` — чинит SMTP-поля в БД
- `apply()` — корректно понимает `unisender_go`
- `preflight()` — **всегда** делает TCP+EHLO+AUTH к SMTP (`config('mail.mailers.smtp')`), даже если активный канал — Unisender Go HTTP API

Поэтому, несмотря на `MAIL_MAILER=unisender_go` в `.env`, восстановление пароля пробует логиниться на Yandex SMTP старым паролем → 535 → «SMTP-сервер отклонил логин или пароль». Само письмо через Unisender Go при этом даже не пробуется отправиться.

### Что меняю
В `PasswordResetController::forgot`:
1. Получать активный канал через `$mail->activeChannel()`.
2. Если канал = `unisender_go` — **пропустить** `autoRepairActiveSettings()` и `preflight()`, сразу вызывать `Password::sendResetLink(...)`.
3. Блок retry с `applyRuntimeEnv()` (он SMTP-специфичен) — тоже выполнять только для SMTP-канала.
4. Логирование ошибки оставить, но для HTTP API канала текст ошибки не подменять на «SMTP отклонил…» — отдавать оригинал (UnisenderGoTransport уже бросает понятные сообщения вида `Unisender Go API error [...]`).

Других файлов не трогаю. На фронте поведение прежнее (POST `/api/auth/forgot-password`).

### Проверка
- `php artisan tinker` → `Password::sendResetLink(['email'=>'zaslavv@gmail.com'])` после деплоя.
- В `email_send_log`/логах Laravel — запрос ушёл через Unisender Go (`POST https://go2.unisender.ru/ru/transactional/api/v1/email/send.json`).

## Проблема 2: «не работает авторизация по email/паролю» для zaslavv@gmail.com

Это отдельный сюжет — к SMTP отношения не имеет. Контроллер `AuthController::login` отдаёт «Неверный email или пароль», если:
- пользователя с таким email нет в таблице `users` MySQL `gro7659365_d`, или
- `users.password` пустой (учётка создана через Google OAuth — пароля нет, только OAuth-вход), или
- хеш битый.

Чтобы понять, что именно — мне нужны ответы (см. вопрос ниже), не лезу в код заранее.

## Чего НЕ делаю
- Не меняю UnisenderGoTransport, конфиг почты, env-файл.
- Не правлю `apply()` — он уже корректно обрабатывает `unisender_go`.
- Не трогаю фронт.