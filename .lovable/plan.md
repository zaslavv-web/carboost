# Предварительная проверка SMTP перед отправкой письма восстановления

## Цель

Перед `Password::sendResetLink()` выполнять быстрый «ping» SMTP-сервера: открыть соединение, выполнить EHLO, STARTTLS (если нужно) и `AUTH LOGIN`. Если шаг падает — сразу вернуть локализованную ошибку (как сейчас), но без попытки рендеринга/постановки письма в очередь. Это даёт чёткий ответ: «коннект есть/нет, авторизация прошла/нет».

## Что меняется

### 1. `backend-laravel/app/Services/EmailConfigService.php`

Добавить публичный метод `preflight(): array`, который:

- Берёт текущую активную конфигурацию (БД или runtime env) через уже существующий `apply()`.
- Читает `config('mail.mailers.smtp')` (host/port/encryption/username/password) — те же значения, что реально использует Mailer.
- Строит `Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport` руками с теми же параметрами:
  - `new EsmtpTransport($host, $port, $encryption === 'ssl')`
  - `->setUsername($username)`, `->setPassword($password)`
  - `->setLocalDomain($ehlo)` если задан
- Вызывает `$transport->start()` — это и есть полный handshake: TCP-коннект → EHLO → STARTTLS (для 587/tls) → AUTH.
- Сразу после успеха — `$transport->stop()`.
- Оборачивает в try/catch:
  - На `TransportExceptionInterface` / `\Throwable` пробрасывает исключение наружу, **не глотая**, чтобы контроллер мог отработать существующую логику ретрая на runtime env (`isSmtpAuthFailure`) и локализацию ошибки.
- Возвращает массив `['host' => ..., 'port' => ..., 'encryption' => ..., 'username' => ..., 'source' => 'db'|'env']` для логов/диагностики.

Дополнительно: метод `preflightSafe(): array` — обёртка, которая ловит исключение и возвращает `['ok' => false, 'error' => ..., 'raw' => ...]` или `['ok' => true, ...]`. Нужна для диагностического эндпоинта (см. ниже).

### 2. `backend-laravel/app/Http/Controllers/Api/Auth/PasswordResetController.php`

В методе `forgot()` перед `Password::sendResetLink`:

```text
$mail->apply();
try {
    $mail->preflight();                 // ← новый шаг
} catch (\Throwable $e) {
    if (EmailConfigService::isSmtpAuthFailure($e)) {
        $mail->applyRuntimeEnv();
        $mail->preflight();             // повторная проверка на runtime env
    } else {
        throw $e;                       // упадёт в существующий catch ниже
    }
}
$status = Password::sendResetLink(...);
```

Логика ретрая и `localizeSmtpError()` остаются прежними — preflight просто бросает то же исключение, что бросил бы реальный send, только раньше и без полезной нагрузки. Логи получают пометку `phase => 'preflight'` vs `phase => 'send'`.

### 3. (Опционально, но полезно) Диагностический эндпоинт

`POST /api/admin/email/preflight` (защищён существующим superadmin middleware, как `EmailSettingsController`):

- Вызывает `EmailConfigService::preflightSafe()`.
- Отдаёт `{ ok, host, port, encryption, username, source, error? }`.
- Позволяет на странице Email Settings нажать кнопку «Проверить соединение» и увидеть результат, не отправляя реальное письмо.

Если нужно — добавлю кнопку в `src/pages/EmailSettingsManagement.tsx` (POST на новый эндпоинт + сонер с результатом). Скажите, нужна ли UI-часть, или достаточно бэкенда + автоматический preflight внутри `forgot()`.

## Что НЕ меняется

- Существующая нормализация Yandex (host/port/encryption/username) — preflight использует уже нормализованный конфиг из `apply()`.
- Логика ретрая на runtime env при auth-ошибке.
- `localizeSmtpError()` — та же функция отрабатывает и preflight, и реальный send.
- Очередь / шаблон `reset.blade.php` / `reset()` метод.

## Почему именно так

- `EsmtpTransport::start()` — это нативный путь Symfony Mailer; он выполняет ровно то же рукопожатие, что и реальный send, включая AUTH. Если сервер примет креды для start(), он примет их и для send().
- Не используем `fsockopen`/`stream_socket_client` вручную: это даст «коннект есть», но не проверит TLS/AUTH — то есть не закроет основную боль (auth 535).
- Preflight быстрый (~100–500 мс) и выполняется до постановки в очередь, поэтому ошибка возвращается синхронно в HTTP-ответе.

## Вопрос к вам

Нужна ли UI-кнопка «Проверить соединение» в админке Email Settings (пункт 3), или ограничиться автоматическим preflight внутри `/api/auth/forgot-password` (пункты 1–2)?
