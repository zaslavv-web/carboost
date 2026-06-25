## Цель

`.env` становится единственным источником правды для SMTP и других учётных данных. БД-настройки (`email_settings`) и захардкоженные значения в `config/service-infra.php` перестают перекрывать `.env`.

## Что меняется

### 1. SMTP читается только из .env
- `config/mail.php` остаётся как есть (он уже читает `MAIL_*` из env).
- `config/service-infra.php` — убрать захардкоженные значения (`smtp.yandex.ru`, `growthpeak@yandex.ru`, и т.д.), заменить на `env('MAIL_HOST')`, `env('MAIL_FROM_ADDRESS')`, `env('MAIL_USERNAME')`, `env('MAIL_PASSWORD')`. Поддержать и `SMTP_PASSWORD`, и `MAIL_PASSWORD` как алиасы для обратной совместимости.
- `EmailConfigService::apply()` — изменить приоритет: сначала всегда `.env` (`applyRuntimeEnv`), запись в БД используется только если в `.env` явно пусто. Это инвертирует текущую логику «БД важнее .env».
- Frontend URL и Google OAuth redirect в `service-infra.php` тоже переводятся на `env(...)` (`FRONTEND_URL`, `GOOGLE_REDIRECT_URI`) с дефолтом для прода.

### 2. Кнопка «использовать .env» в админке остаётся, но становится индикатором
- В UI добавляется явная плашка: «Активный источник SMTP — .env». Запись в БД теперь возможна как переопределение (если её специально активируют), но по умолчанию игнорируется.
- Тестовая отправка из админки и из RPC (`notifySales`) тоже идёт через `.env`.

### 3. Artisan-команды для SSH-диагностики
- `php artisan smtp:status` — показывает host, port, encryption, username, from, есть ли пароль (без вывода значения), какой именно источник (`.env` / БД / файл).
- `php artisan smtp:test you@example.com` — отправляет тестовое письмо через тот же путь, что и заявки с лендинга, и пишет результат и причину 535/прочих ошибок прямо в stdout.
- `php artisan smtp:db-clear` — деактивирует записи в `email_settings`, чтобы они точно не перекрывали `.env`.

### 4. Сброс пароля суперадмина без UI
- `php artisan superadmin:reset-password <email>` — запросит новый пароль интерактивно (не светится в bash history), назначит роль `superadmin`, выставит `is_verified=true`. Полезно прямо сейчас, чтобы вернуть доступ.

### 5. Документация в `.env.example`
- Добавить блок с актуальными ключами: `MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `SALES_NOTIFICATION_EMAIL`, плюс пометка про пароль приложения Яндекса.

## Что делает пользователь после деплоя

1. `php artisan optimize:clear`
2. `php artisan smtp:db-clear` — на всякий случай отключить запись в БД.
3. `php artisan smtp:status` — проверить, что показывает host/user из `.env`.
4. `php artisan smtp:test growthpeak@yandex.ru` — увидеть конкретную ошибку или подтверждение отправки.
5. Если всё ещё 535 — это уже однозначно неверный пароль приложения Яндекса; перевыпустить пароль приложения в Яндекс ID и обновить только `MAIL_PASSWORD` в `.env`.
6. `php artisan superadmin:reset-password ваш@email` — вернуть доступ к админке.

## Что НЕ меняется

- Таблица `email_settings` остаётся (для обратной совместимости и аудита), но по умолчанию не используется.
- Шаблоны писем и `RpcController` логика отправки заявок — без изменений, только источник SMTP меняется.