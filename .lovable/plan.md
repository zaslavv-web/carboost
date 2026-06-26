SMTP-порты 465/587 у хостера закрыты, открыт только 443. Переходим на **Unisender Go** — российский сервис транзакционной почты с HTTP API. Бесплатно до 1500 писем/мес, хорошая доставляемость на yandex/mail.ru, российские IP, REST через HTTPS, никаких блокировок портов.

## Что нужно от вас (предусловия)

1. Регистрация на `https://godocs.unisender.ru/` (Unisender **Go**, не путать с обычным Unisender для рассылок).
2. В кабинете Unisender Go:
  - Добавить и подтвердить домен-отправитель (например, `growth-peak.pro`) — нужно прописать **SPF, DKIM, DMARC** записи в DNS домена. Без подтверждения письма уходить не будут.
  - Создать **API-ключ** для проекта.  
  что указать в домене ссылок?  

3. Адрес отправителя должен быть на подтверждённом домене, например `noreply@growth-peak.pro` или `growthpeak@growth-peak.pro`. Слать с `@yandex.ru` через сторонний сервис нельзя — попадёт в спам / отклонится.  
где это взять?

Получатель уведомлений (`growthpeak@yandex.ru`) остаётся прежним — меняется только канал доставки и `From`.

## Что я сделаю в коде

### 1. HTTP-транспорт Unisender Go

- `app/Mail/Transport/UnisenderGoTransport.php` — кастомный Symfony Mailer transport. Сериализует `Symfony\Component\Mime\Email` в JSON формата Unisender Go (`message.recipients[].email`, `message.subject`, `message.body.html`, `message.from_email`, `message.from_name`) и шлёт POST через Guzzle на `https://go1.unisender.ru/ru/transactional/api/v1/email/send.json` с заголовком `X-API-KEY`.
- Обрабатывает ответ: при `status: success` возвращает `SentMessage`, при ошибке кидает исключение с расшифровкой кода (`failures[].code`).

### 2. Регистрация драйвера

- В `config/mail.php` добавлю секцию:
  ```php
  'unisender_go' => [
      'transport' => 'unisender_go',
      'api_key' => env('UNISENDER_GO_API_KEY'),
      'endpoint' => env('UNISENDER_GO_ENDPOINT', 'https://go1.unisender.ru/ru/transactional/api/v1/email/send.json'),
      'timeout' => 15,
  ],
  ```
- В `AppServiceProvider::boot()` вызову `Mail::extend('unisender_go', fn ($config) => new UnisenderGoTransport(...))`.

### 3. `.env` на сервере (после моих правок)

```
MAIL_MAILER=unisender_go
MAIL_FROM_ADDRESS=noreply@growth-peak.pro
MAIL_FROM_NAME="Пик Роста"
UNISENDER_GO_API_KEY=<ключ из кабинета>
SALES_NOTIFICATION_EMAIL=growthpeak@yandex.ru
```

Старые `MAIL_HOST/MAIL_PORT/MAIL_USERNAME/MAIL_PASSWORD/SMTP_PASSWORD` можно оставить — игнорируются при `MAIL_MAILER=unisender_go`.

### 4. EmailConfigService / EmailSettingsController

- Расширю `EmailConfigService`: при `MAIL_MAILER=unisender_go` пропускать всю SMTP-логику (host/port/auth/preflight). Конфигурация считается «здоровой», если есть `UNISENDER_GO_API_KEY` + `MAIL_FROM_ADDRESS`.
- `effectiveSource()` будет возвращать `source: unisender_go` с явной меткой в UI: **«Активный канал: Unisender Go (HTTP API)»**.
- `sendTest()` для `unisender_go` отправляет реальное короткое письмо через транспорт (без AUTH/preflight).
- `preflight()` для `unisender_go` делает «лёгкий» GET на endpoint проверки ключа (если есть) либо просто валидирует наличие ключа и From.

### 5. UI `EmailSettingsManagement.tsx`

- В верхней части — селектор «Канал отправки»: **SMTP** / **Unisender Go (HTTP API)**.
- Для Unisender Go скрываю поля host/port/encryption/username/password. Показываю: `API Key` (write-only), `From address`, `From name`, `Reply-To`.
- Кнопка «Отправить тест» — существующий endpoint `/api/admin/email/test`, работает одинаково для обоих каналов.

### 6. БД

- В таблицу `email_settings` добавлю миграцией поля `api_key_encrypted` и `transport` (значения: `smtp` | `unisender_go`). Старые SMTP-поля остаются для совместимости.

### 7. Artisan-команды

- `php artisan mail:channel` — покажет активный канал, источник конфигурации (.env / БД), наличие ключа/пароля.
- `php artisan mail:test growthpeak@yandex.ru` — реальная отправка текущим каналом. Заменит/дополнит существующие `smtp:test`/`smtp:status` (старые оставлю как алиасы для обратной совместимости).

### 8. Логирование и ретраи

- Каждый POST в Unisender Go логируется в `storage/logs/laravel.log` с HTTP-статусом, `job_id` из ответа и временем.
- При 5xx — авто-ретрай 3 раза с паузой 1с/3с/9с.
- При 4xx (неверный ключ, неподтверждённый домен, плохой адрес) — понятное русское сообщение в UI: «Unisender Go отклонил запрос: <причина>».

## Деплой на сервере (после моих правок)

1. `cd /home/gro7659365/growth-peak.pro/docs/backend`
2. `git pull`
3. `composer install --no-dev --optimize-autoloader` (если добавится новая зависимость — Guzzle уже в Laravel)
4. `php artisan migrate --force`
5. Прописать в `.env`: `MAIL_MAILER=unisender_go`, `UNISENDER_GO_API_KEY=...`, `MAIL_FROM_ADDRESS=noreply@growth-peak.pro`
6. `php artisan optimize:clear`
7. `php artisan mail:channel` → должно показать **«Активный канал: Unisender Go»**
8. `php artisan mail:test growthpeak@yandex.ru` → реальное письмо
9. Демо-запрос с лендинга — письмо должно прийти в `growthpeak@yandex.ru`

## Что нужно решить сейчас

1. Какой адрес отправителя использовать: `noreply@growth-peak.pro`, `growthpeak@growth-peak.pro` или другой? (Должен быть на домене, который вы подтвердите в Unisender Go.)
2. Готовы сами зарегистрироваться в Unisender Go, подтвердить домен (SPF/DKIM/DMARC) и получить API-ключ, или нужна пошаговая инструкция «куда нажать»?
3. Оставлять ли в коде возможность переключаться обратно на SMTP через UI (на случай, если хостер всё-таки откроет порты), или удалить SMTP-ветку совсем?  
  
Пока ничего в код не вноси
  &nbsp;