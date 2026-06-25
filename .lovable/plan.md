## Проблема

Форма заявки на демо на лендинге шлёт POST `/api/rpc/submit_demo_request`, который в `RpcController` пытается выполнить SQL `select public.submit_demo_request(...)`. Эта Postgres-функция была частью legacy Supabase-схемы и при миграции на Laravel **не была перенесена** — её просто нет в БД. Любая ошибка от `DB::select` пропускается через `localize()`, который для незнакомых сообщений возвращает дефолт «Ошибка выполнения операции». То же самое касается `submit_pricing_inquiry` — он сломан по той же причине.

## Решение

Перестать звать несуществующие Postgres-функции для публичных форм лендинга и обработать обе RPC напрямую в `RpcController` через Eloquent-модели — таблицы `demo_requests` и `pricing_inquiries` уже существуют, поля известны.

## Изменения

**`backend-laravel/app/Http/Controllers/Api/RpcController.php`**
- В `call()` добавить ранний маршрут для публичных форм по аналогии с `callLocalUserAdminFunction`: если `$name in ['submit_demo_request','submit_pricing_inquiry']` — вызвать новые приватные методы.
- `submitDemoRequest(array $payload)`:
  - Валидировать `_name` и `_email` (непустые, email формат); вернуть 422 с понятным русским сообщением при ошибке.
  - Привести `_headcount` к int|null, обрезать строки, `_source` по умолчанию `'landing'`.
  - `DemoRequest::create([...])` с `id = (string) Str::uuid()`, `status='new'`.
  - Вернуть `{ data: { id } }`.
- `submitPricingInquiry(array $payload)`: аналогично, для `PricingInquiry` (создать модель, если её нет — проверить `app/Models/PricingInquiry.php`; если отсутствует, добавить тонкую модель с `$table='pricing_inquiries'`, `$keyType='string'`, `public $incrementing=false`, `$guarded=[]`).
- Обернуть в try/catch с логированием через `report($e)` и возвратом локализованного сообщения.

**`backend-laravel/tests/Feature/RpcControllerTest.php`**
- Существующий `test_submit_demo_request_is_public` должен начать проходить (сейчас, скорее всего, тоже падает на отсутствующей функции). При необходимости поправить ожидание ответа на `{ data: { id } }`.
- Добавить аналогичный тест на `submit_pricing_inquiry`.

## Чего НЕ трогаем

- Фронтенд `DemoRequestDialog.tsx` — контракт `{ data }`/`{ error }` сохраняется, правок не требуется.
- Остальные RPC, продолжающие ходить в Postgres-функции (там SECURITY DEFINER логика, переезд — отдельная задача).
- Миграции — таблицы уже на месте.

## Проверка

1. `php artisan test --filter=RpcControllerTest` зелёный.
2. С лендинга отправить демо-форму → toast «успешно», в `demo_requests` появилась запись.
