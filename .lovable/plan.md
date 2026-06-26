## Диагноз

Сейчас видно две независимые ошибки.

1. **`unisender:test` всё ещё отправляет через SMTP/Yandex**
   - Значит на VPS Laravel не видит `MAIL_MAILER=unisender_go` или mailer уже был собран из закешированного `config/mail.php` до runtime-подстановки.
   - В коде `EmailConfigService::apply()` уже умеет выбирать `unisender_go`, но `config/mail.mailers.unisender_go.key` берётся из `env()` и при config cache может остаться пустым/старым.
   - Плюс в `AppServiceProvider` Unisender transport берёт ключ из `$config['key'] ?? env(...)`, но не из `RuntimeEnv`, который специально читает реальный `.env` на shared hosting.

2. **`SQLSTATE[1045] Access denied for user 'gro7659365_grow'@'localhost'`**
   - Это не ошибка кода логина и не OAuth.
   - Laravel CLI/PHP сейчас подключается к MySQL с неправильной парой `DB_USERNAME`/`DB_PASSWORD` или не тем `DB_HOST` из фактически загруженного `.env`/config cache.
   - Пока БД не подключается, tinker-запрос пользователя и авторизация по почте работать не будут.

3. **Аккаунт создан через Google OAuth**
   - У такого пользователя может быть пустой `password`, поэтому обычный email+password вход должен показывать понятную ошибку: «войдите через Google или задайте пароль через восстановление».

## Что меняю в коде

### 1. Сделать Unisender Go устойчивым к config cache на shared hosting
Файл: `backend-laravel/app/Providers/AppServiceProvider.php`

- В регистрации `unisender_go` использовать `RuntimeEnv::get('UNISENDER_GO_API_KEY')`, `RuntimeEnv::get('UNISENDER_GO_ENDPOINT')`, `RuntimeEnv::get('UNISENDER_GO_TIMEOUT')` как приоритетный источник.
- Это позволит `php artisan unisender:test ...` видеть реальные значения из `.env`, даже если Laravel config cache старый.

Файл: `backend-laravel/app/Services/EmailConfigService.php`

- В `applyHttpApiMailer()` дополнительно выставлять runtime config:
  - `mail.mailers.unisender_go.key`
  - `mail.mailers.unisender_go.endpoint`
  - `mail.mailers.unisender_go.timeout`
- После этого `Mail::raw()` должен строить именно Unisender Go transport, а не падать обратно в SMTP/Yandex.

### 2. Улучшить диагностику команды `unisender:test`
Файл: `backend-laravel/app/Console/Commands/UnisenderTest.php`

- Перед отправкой показывать:
  - активный канал,
  - `MAIL_MAILER` из runtime `.env`,
  - endpoint Unisender,
  - наличие API key.
- Если runtime `MAIL_MAILER=unisender_go`, но активный канал не `unisender_go`, команда будет явно писать диагностическое предупреждение.

### 3. Понятная ошибка для Google-only аккаунта
Файл: `backend-laravel/app/Http/Controllers/Api/Auth/AuthController.php`

- В `login()` после поиска пользователя:
  - если пользователь найден, но `password` пустой — вернуть 422 с сообщением:
    `Этот аккаунт зарегистрирован через Google. Войдите через кнопку "Google" или задайте пароль через "Забыли пароль?".`
  - добавить в JSON `code: oauth_only`, `provider: google`.

## Что нужно сделать на VPS после деплоя

```bash
cd ~/growth-peak.pro/docs/backend
php artisan config:clear
php artisan cache:clear
php artisan smtp:status
php artisan unisender:test zaslavv@gmail.com
```

Для БД отдельно проверить фактически загруженные значения без раскрытия пароля:

```bash
php artisan tinker
```

Внутри tinker:

```php
[
  'env_file' => app()->environmentFilePath(),
  'db_host' => config('database.connections.mysql.host'),
  'db_database' => config('database.connections.mysql.database'),
  'db_username' => config('database.connections.mysql.username'),
  'password_len' => strlen((string) config('database.connections.mysql.password')),
]
```

Если `db_host/db_username/password_len` не совпадают с рабочими значениями из панели хостинга — править `.env` и снова `php artisan config:clear`.

## Что НЕ делаю

- Не меняю пароль БД и не трогаю `.env` из кода.
- Не переписываю OAuth.
- Не возвращаюсь к Yandex SMTP: целевой канал остаётся Unisender Go.