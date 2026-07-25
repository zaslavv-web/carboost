## Диагноз

500 возникает на `POST /api/performance-cycles/{id}/open` уже после создания цикла.

Что подтверждено по текущему репозиторию и доступной схеме:

- В коде `openCycle()` уже убран старый фильтр `profiles.is_active`, поэтому текущая причина не обязательно та же, что была первой.
- В доступной схеме `notifications` нет колонки `updated_at`, а текущий `PerformanceController::notify()` вставляет `updated_at`.
- Если такой SQL падает внутри `DB::transaction()`, PostgreSQL помечает всю транзакцию как aborted. Даже если PHP ловит exception в `try/catch`, дальнейший commit может завершиться 500. Это хорошо объясняет симптом: цикл есть, но открыть его невозможно.

## План исправления

1. Переписать `PerformanceController::openCycle()` так, чтобы один сбой по сотруднику или уведомлению не ронял весь запрос:
   - убрать общий `DB::transaction()` вокруг всего открытия цикла;
   - сначала перевести цикл в `open`;
   - затем создавать/находить `performance_reviews` по сотрудникам в обычном autocommit-режиме;
   - ошибки по отдельным сотрудникам складывать в `review_errors[]`, а не превращать весь endpoint в 500.

2. Сделать уведомления безопасными:
   - вынести отправку/создание notification из критического пути открытия цикла;
   - перед вставкой проверять, есть ли в таблице `notifications.updated_at`;
   - если колонки нет — не вставлять её;
   - если notification не создалось — вернуть это в `notification_errors[]`, но сам цикл и reviews оставить созданными.

3. Сделать ответ API диагностичным:
   - `ok: true` при успешном открытии цикла;
   - `reviews_created`;
   - `reviews_existing`;
   - `review_errors`;
   - `notification_errors`.

4. Проверка после правки:
   - локально: проверить PHP-синтаксис изменённого контроллера;
   - на бою после деплоя: повторить `POST /api/performance-cycles/a2560ea4-eacf-4edb-a5f0-b04de4632ca4/open`;
   - ожидаемый результат: HTTP 200, статус цикла `open`, созданные draft reviews; возможные проблемы уведомлений должны быть видны в JSON, но не должны давать 500.

## Технические файлы

- Основная правка: `backend-laravel/app/Http/Controllers/Api/PerformanceController.php`.
- Миграция не обязательна: фикс будет работать и со старой схемой `notifications` без `updated_at`.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
  <presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>