## Диагноз

`RpcController::notifySales()` сейчас просто зовёт `Mail::to(...)->send(...)` и проглатывает любые ошибки через `report($e)`. В проекте уже есть полноценный `EmailConfigService` (DB → file → runtime env), которым пользуется `PasswordResetController`, и он умеет:
- применять активные SMTP-настройки из таблицы `email_settings`,
- при ошибках расшифровки/AUTH (`shouldFallbackToRuntimeEnv`) повторять отправку через `applyRuntimeEnv()` (`MAIL_*` из `.env`).

Заявки на демо/тарифы используют тот же mail-стек, но без этого фолбэка. Если в `email_settings` есть «битая» строка (нерасшифровываемый пароль, протухший пароль приложения Яндекса) — письмо тихо не уходит, ошибка падает только в `report($e)` без человекочитаемого контекста.

## Что меняю

Только `backend-laravel/app/Http/Controllers/Api/RpcController.php`, метод `notifySales()`:

1. Получать `EmailConfigService` через контейнер.
2. Вызвать `autoRepairActiveSettings()` + `apply()` перед отправкой.
3. Обернуть `Mail::to($recipient)->send(...)` в try/catch:
   - при `EmailConfigService::shouldFallbackToRuntimeEnv($e)` — `applyRuntimeEnv()` и повторить отправку;
   - иначе — `Log::warning('Sales notification failed', [...])` с темой письма, получателем, сообщением исключения.
4. При успехе писать `Log::info('Sales notification sent', ['to' => $recipient, 'subject' => ...])` — чтобы по `storage/logs/laravel.log` можно было однозначно подтвердить факт отправки.
5. По-прежнему никогда не ронять HTTP-ответ пользователю (внешний try/catch остаётся).

## Как проверить после деплоя

1. Отправить форму демо/прайсинга с лендинга.
2. На сервере: `tail -n 200 backend-laravel/storage/logs/laravel.log | grep -i "Sales notification"`.
   - `Sales notification sent` → письмо ушло в SMTP, дальше смотреть Яндекс (входящие/спам, журнал отправок Яндекс 360).
   - `Sales notification failed` → в логе будет точная причина (AUTH 535, таймаут, decrypt и т.д.) — по ней уже чиним SMTP-настройки или пароль в `email_settings`/`.env`.

## Что НЕ меняю

- `config/mail.php`, `EmailConfigService`, Mailable-классы, шаблоны писем — без изменений.
- `.env` на сервере трогать не нужно: `SALES_NOTIFICATION_EMAIL` имеет фолбэк на `MAIL_FROM_ADDRESS` = `growthpeak@yandex.ru`.
