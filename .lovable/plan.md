## Проблема

В `RpcController::submitDemoRequest` и `submitPricingInquiry` заявка только сохраняется в БД (`demo_requests` / `pricing_inquiries`) — никакой отправки email нет. Поэтому ошибки нет, но и письма не приходит.

## Что сделаю

### 1. Mailables (Laravel)

- `backend-laravel/app/Mail/DemoRequestSubmitted.php` — письмо менеджеру со всеми полями заявки (имя, email, компания, штат, источник).
- `backend-laravel/app/Mail/PricingInquirySubmitted.php` — то же для запроса по тарифу.
- Простые HTML-шаблоны:
  - `resources/views/emails/demo-request.blade.php`
  - `resources/views/emails/pricing-inquiry.blade.php`
- Subject на русском, `replyTo` = email клиента, чтобы можно было ответить прямо из почты.

### 2. Триггер в `RpcController`

После успешного `DemoRequest::create()` / `PricingInquiry::create()`:

```php
Mail::to(config('mail.sales_recipient'))->send(new DemoRequestSubmitted($row));
```

Обернуть в `try/catch` + `report($e)`, чтобы провал почты не валил ответ клиенту (заявка уже в БД).

### 3. Конфиг получателя

- `config/mail.php`: добавить `'sales_recipient' => env('SALES_NOTIFICATION_EMAIL', env('MAIL_FROM_ADDRESS'))`.
- `.env.example`: добавить `SALES_NOTIFICATION_EMAIL=sales@yourcompany.ru` с комментарием.

### 4. Диагностика текущего окружения

В ответе после плана напомню проверить на проде:

- `MAIL_MAILER`, `MAIL_HOST`, `MAIL_USERNAME/PASSWORD` заданы (если `MAIL_MAILER=log` — письма уходят только в `storage/logs/laravel.log`, это самая частая причина «писем нет»);
- `SALES_NOTIFICATION_EMAIL` задан;
- проверить `storage/logs/laravel.log` на ошибки SMTP.

### 5. Тест

Добавлю в `tests/Feature/RpcControllerTest.php` ассерт с `Mail::fake()` — что после `submit_demo_request` отправляется `DemoRequestSubmitted` указанному получателю.

## Вопрос

Какой email указать получателем уведомлений по умолчанию (через `SALES_NOTIFICATION_EMAIL`)? Если не уточните — оставлю фолбэк на `MAIL_FROM_ADDRESS`, и вы зададите переменную на сервере.  
growthpeak@yandex.ru