## План перехода на Unisender Go

### Шаг 1. DNS-записи у регистратора growth-peak.pro

Внести **ровно то, что показал Unisender Go**, в панели регистратора домена:


| Имя             | Тип   | Значение                                                                         |
| --------------- | ----- | -------------------------------------------------------------------------------- |
| `@`             | TXT   | `v=spf1 include:spf.unisender.ru ~all`                                           |
| `us._domainkey` | TXT   | `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3...IDAQAB` (вся длинная строка одной записью) |
| `@`             | TXT   | `unisender-go-validate-hash=adb533d5c7d4f14f21428b9528f09276`                    |
| `_dmarc`        | CNAME | `growth-peak.pro.dmarc.unisender.ru.`                                            |
| `mail`          | NS    | `uns1.unisender.com.`                                                            |
| `mail`          | NS    | `uns2.unisender.com.`                                                            |
| `mail`          | NS    | `uns3.unisender.com.`                                                            |


Важные нюансы:

- Поддомен `mail.growth-peak.pro` **полностью делегируется** Unisender (3 NS-записи). Не добавляйте на нём никаких A/MX/TXT — Unisender управляет зоной сам.
- Если у вас уже есть SPF на `@` (например, для Яндекс-почты на корне) — **нельзя** держать два TXT с `v=spf1`. Их нужно объединить в одну строку: `v=spf1 include:spf.unisender.ru include:_spf.yandex.net ~all`.
- DKIM `us._domainkey` — значение в одну строку, без переносов. Если панель регистратора требует кавычки — обрамить значение кавычками.
- DMARC через CNAME означает, что Unisender сам отдаст политику. Свой `_dmarc` TXT на корне держать одновременно с этим CNAME нельзя — оставляем только CNAME.

После внесения записей в кабинете Unisender Go нажать «Проверить домен». Распространение DNS — до нескольких часов.

### Шаг 2. Сохранить API-ключ

Когда DNS внесён — сохраняю API-ключ Unisender Go через защищённую форму (`UNISENDER_GO_API_KEY`). Ключ попадёт в окружение Laravel на VPS как переменная среды, в коде хранить не будем.  
куда тебе его прислать?

### Шаг 3. Интеграция в Laravel (`backend-laravel`)

1. **Transport**: `app/Mail/Transport/UnisenderGoTransport.php` — Symfony Mailer transport, шлёт POST на `https://go1.unisender.ru/ru/transactional/api/v1/email/send.json` с заголовком `X-API-KEY`, телом `{message: {from_email, from_name, to_email, subject, body:{html,plaintext}, headers}}`.
2. **Driver**: регистрация `unisender_go` в `config/mail.php` + `TransportFactory` через `AppServiceProvider::boot()` (Laravel 11 паттерн `Mail::extend('unisender_go', ...)`).
3. **Config**: новые ENV-переменные:
  ```
   MAIL_MAILER=unisender_go
   UNISENDER_GO_API_KEY=...        # из add_secret
   UNISENDER_GO_ENDPOINT=https://go1.unisender.ru/ru/transactional/api/v1/email/send.json
   MAIL_FROM_ADDRESS=noreply@mail.growth-peak.pro
   MAIL_FROM_NAME="Growth Peak"
   MAIL_REPLY_TO=growthpeak@yandex.ru
  ```
4. **EmailConfigService**: добавить ветку для `channel=unisender_go` — приоритет `.env` сохраняем, БД может только переопределять `from`/`reply_to`.
5. **Mailables**: `DemoRequestSubmitted` и `PricingInquirySubmitted` уже работают через стандартный `Mail::send` — менять не нужно, они автоматически уйдут через новый transport. Reply-To проставим в Mailable, чтобы ответы летели на Яндекс.
6. **Артизан-команды**:
  - `unisender:test {email}` — отправляет тестовое письмо и печатает HTTP-ответ Unisender.
  - `smtp:status` обновим: показывает активный канал (SMTP / Unisender Go), endpoint, длину API-ключа.

### Шаг 4. UI админки (`EmailSettingsManagement.tsx`)

- Добавить селектор «Канал отправки»: `SMTP (Яндекс)` / `Unisender Go (HTTP API)`.
- Для Unisender показывать: статус домена (проверяется через `unisender:status`), from-адрес, reply-to, маскированный API-ключ (только индикация наличия — само значение из ENV, не редактируется через UI).
- SMTP-секция остаётся как fallback на случай возврата.

### Шаг 5. Проверка на VPS

После деплоя:

1. `php artisan config:clear && php artisan optimize:clear`
2. `php artisan smtp:status` — убедиться, что активный канал = `unisender_go`, ключ длиной 32+ символа.
3. `php artisan unisender:test growthpeak@yandex.ru` — должен прийти HTTP 200 от Unisender и письмо в течение минуты.
4. Тест с лендинга: форма «Заказать демо» → письмо приходит на `growthpeak@yandex.ru`.

### Что НЕ меняем

- Старые SMTP-команды (`smtp:test`, `smtp:env-doctor`, `smtp:where`) оставляем для диагностики.
- Шаблоны писем, RPC `submitDemoRequest`/`submitPricingInquiry`, фронтенд лендинга — без изменений.

### Открытые вопросы перед стартом реализации

- Подтвердите, что регистратор у вас позволяет ставить **NS на поддомен** `mail` (большинство — да, но у некоторых бюджетных регистраторов есть ограничения). Если нет — Unisender предлагает альтернативу через CNAME, тогда DNS-таблица будет другой.  
вроде бы все прошгло успешно - тестовое письмо ушло
  &nbsp;
- Готовы ли удалить/сливать существующий SPF на корне, если он уже стоит для Яндекса?  
пока нет  
вопрос: нужно ли мне брать платный тариф?  
Чтобы отправлять письма на любые адреса, а не только на свой домен, [выберите и подключите один из платных тарифов](https://go2.unisender.ru/ru/user/billing/subscription/edit). Например тариф [StartUp 6K](https://go2.unisender.ru/ru/user/billing/subscription/edit#6k-trial) дает 2 месяца работы без оплаты.
  &nbsp;