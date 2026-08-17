# 422 на `/api/university/courses`

## Что происходит

`GET /api/university/courses` отвечает 422 `company_id required` для любого пользователя, который не передал `company_id` в запросе явно (фронт его не передаёт).

Причина подтверждена чтением кода:

- `CourseController::companyId()` (строка 20) берёт компанию как `$u?->company_id` — атрибут модели `User`.
- В схеме БД у таблицы `users` нет колонки `company_id`: компания хранится в `profiles.company_id` (миграция `0002_00_37_000000_create_profiles_table.php`).
- В `app/Models/User.php` нет аксессора `company_id`; корректный способ — метод `companyId()` (строка 254), читающий `profiles`.

Итог: `$u->company_id` всегда `null` → контроллер отдаёт 422.

Тот же дефект есть в других контроллерах, которые обращаются к `$user->company_id` напрямую:
`RagController`, `GamificationLevelController`, `InitiativeController`, `PulseSurveyController`, `AiSettingsController`, `Services/AI/AiSettingsResolver`.

## Что делаю

1. В `CourseController::companyId()` заменяю `$u?->company_id` на `$u?->companyId()` (с сохранением приоритета явного `company_id` из запроса — он нужен суперадмину).
2. Тем же способом чиню остальные перечисленные места: везде `->company_id` у объекта пользователя → `->companyId()`.
3. Для суперадмина без привязанной компании и без параметра `company_id` в `CourseController::index` возвращаю пустой список курсов вместо 422 (422 остаётся только для операций записи, где компания обязательна).
4. Проверяю на боевом сервере боевым токеном: `/api/university/courses`, `/api/university/my-enrollments`, `/api/university/blockers` — ожидаю 200.

## Технические детали

- Правки только в PHP-контроллерах бэкенда, миграции не нужны, схема не меняется.
- Фронтенд (`src/pages/University.tsx`) не трогаю — он корректно вызывает эндпоинт без `company_id`.
- После мержа нужен деплой бэка: `git pull`, `php artisan config:cache`, `route:cache`.
