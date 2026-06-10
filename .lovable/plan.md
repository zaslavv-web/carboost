# Fix: «The user id field must be a valid UUID» в продуктовой аналитике пользователя

## Причина

Эндпоинт `GET /api/analytics/user-timeline` валидирует параметр жёстко как UUID:

```php
// backend-laravel/app/Http/Controllers/Api/AnalyticsController.php:344
$userId = $request->validate(['user_id' => 'required|uuid'])['user_id'];
```

Но в проде идентификатор пользователя — не всегда UUID. В этом же проекте уже есть миграции, релаксирующие тип под смешанный формат (UUID + integer):

- `0005_..._relax_impersonation_audit_user_ids.php` — `VARCHAR(64)`
- `0006_..._relax_sanctum_tokenable_id.php` — `VARCHAR(64)`

Фронт берёт `profile.user_id` из `/profiles/{id}` (см. `src/pages/UserProfileFull.tsx` и `UserProductAnalytics.tsx`) и передаёт его как есть. Для `alexandra.rassudkova@gmail.com` это значение не имеет формата UUID → Laravel-валидатор `uuid` падает с 422 «The user id field must be a valid UUID».

## Что меняем (1 файл)

**`backend-laravel/app/Http/Controllers/Api/AnalyticsController.php`** — метод `userTimeline()`:

Заменить
```php
$userId = $request->validate(['user_id' => 'required|uuid'])['user_id'];
```
на мягкую валидацию, допускающую любой непустой ID до 64 символов (UUID, integer-id, supabase sub):
```php
$userId = $request->validate([
    'user_id' => ['required','string','max:64','regex:/^[A-Za-z0-9_\-]+$/'],
])['user_id'];
```

Это согласует контракт эндпоинта с фактическим типом колонок `analytics_events.user_id` / `profiles.user_id` в проде (см. relax-миграции выше) и не ослабляет безопасность — поле всё ещё ограничено по длине и алфавиту, а выборка идёт через параметризованный `where('user_id', $userId)`.

## Что НЕ трогаем

- Схему БД (`analytics_events` остаётся как есть)
- Фронт (`UserProductAnalytics.tsx`, `UserProfileFull.tsx`) — он уже передаёт правильный `profile.user_id`
- Остальные методы `AnalyticsController` (overview, sessions и т.д.)

## Проверка

1. `curl -H 'Authorization: Bearer <superadmin>' 'https://growth-peak.pro/api/analytics/user-timeline?user_id=<id-Александры>'` → 200, JSON с `events[]` и `sessions[]`.
2. UI «Продуктовая аналитика» в карточке пользователя загружается без ошибки.
3. `curl ...?user_id=' OR 1=1' ` → 422 (regex отсекает).
