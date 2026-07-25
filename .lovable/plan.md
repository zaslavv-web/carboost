## Диагноз

При нажатии «Открыть цикл» на бою падает 500. Причина — в `backend-laravel/app/Http/Controllers/Api/PerformanceController.php::openCycle()` идёт запрос:

```php
Profile::query()
    ->where('company_id', $cycle->company_id)
    ->where('is_active', true)   // ← колонки нет
    ->get(['user_id']);
```

Подтверждено запросом к БД: таблица `public.profiles` содержит колонки `id, user_id, full_name, position, department, avatar_url, hire_date, overall_score, role_readiness, created_at, updated_at, is_verified, requested_role, position_id, company_id, pending_position_id`. Колонки `is_active` нет → Postgres 42703 → 500.

Именно поэтому сам цикл создаётся (в `storeCycle` этой колонки не касаются, а `company_id` подставляется трейтом `BelongsToCompany`), но «войти в него» (open) — нельзя.

## Что делаю

Правлю `openCycle()` — заменяю `is_active` на реально существующий признак «активного сотрудника»:

- убираю фильтр `is_active`;
- добавляю осмысленный `whereNotNull('user_id')` и фильтрацию по существованию пользователя в `users`;
- (опционально) добавляю фильтр «не заблокирован» через `whereNotIn('user_id', function ($q) { $q->select('user_id')->from('user_roles')->where('role', 'disabled'); })` — только если такая роль реально используется. Проверю по данным и, если нет, оставлю без него.

Также добавлю guard: обернуть цикл создания reviews в per-employee `try/catch`, чтобы одна битая запись не роняла всю операцию, и вернуть в ответ `errors[]`.

## Проверка после правки

1. `curl -X POST /api/performance-cycles/{id}/open` под HRD `growthpeak@yandex.ru` → 200, `reviews_created > 0`.
2. `SELECT count(*) FROM performance_reviews WHERE cycle_id = :id` — совпадает с числом активных профилей компании.
3. В UI: цикл переходит в статус `open`, вкладка «Мои оценки» у сотрудников этой компании показывает draft.

## Технические детали

- Файл правки: `backend-laravel/app/Http/Controllers/Api/PerformanceController.php`, метод `openCycle` (строки ~50–85).
- Миграций не требуется.
- Никаких изменений во фронте — API-контракт сохраняется.
- Деплой: `git pull` в `docs/backend` на бою + `php artisan config:clear` (миграции не нужны).
