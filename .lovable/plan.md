# 500 на /api/db/positions и /api/db/career_track_templates

## Статус диагностики памяти

Замер закрыт: `/api/diag/request-memory` показал `boot_mb=4`, все стадии по 4 МБ, `peak_mb=4` при лимите 256M; `/api/chats/unread-count` вернул `{"unread":0}`. Прежняя проблема с памятью на этом пути воспроизводиться перестала.

Новые 500 — на другом эндпоинте (`/api/db/{table}`, `DbController@index`), это отдельная причина, и она пока не подтверждена. Гадать не буду: сначала достаём `error_id` из лога.

## Шаг 1. Достать точную ошибку (без изменений кода)

На сервере:

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
grep -n "api_fatal\|api_memory_high\|db/positions\|career_track_templates\|SQLSTATE" storage/logs/laravel.log | tail -40
```

Все ответы 500 из `/api/*` теперь содержат JSON с `error_id` — если он есть в консоли браузера, пришлите его: по нему строка в логе ищется точно:

```bash
grep -n "<error_id>" storage/logs/laravel.log
```

Ожидаемые варианты и что каждый означает:

- `SQLSTATE[42S22] Unknown column ...` — расхождение схемы: миграция не применена на бою.
- `SQLSTATE[42S02] Base table ... doesn't exist` — таблицы `career_track_templates` / `positions` нет.
- `api_fatal` с памятью — снова выборка без лимита (проверим `DEFAULT_ROWS`).
- `max_user_connections` / `db_busy` — исчерпание соединений хостинга.

## Шаг 2. Проверить схему на боевой базе

```bash
php artisan migrate:status | tail -30
php artisan tinker --execute="dump(\Schema::hasTable('career_track_templates'), \Schema::getColumnListing('positions'));"
```

Это отвечает на вопрос «код новый, а база старая?» — самый частый источник 500 сразу после выкладки.

## Шаг 3. Исправление по факту

- Если не хватает миграций — `php artisan migrate --force` + `optimize:clear`.
- Если расхождение колонок — правим выборку/модель под фактическую схему (`PositionController`, `CareerTrackTemplateController`, `DbController` — белый список колонок).
- Если память/лимиты — добавляем явный `limit` и выборку только нужных колонок для этих двух таблиц (сейчас `DbController` режет по 500 строк уже после выборки, что не спасает при широких таблицах).
- Если соединения — возвращаем 503 `db_busy` вместо 500, чтобы фронт не рисовал ошибку страницы.

## Шаг 4. Проверка

Вход в «Карьерные треки», отсутствие 500 в Network, повторный `grep` по логу — новых `api_fatal` нет.

## Технические детали

- Точка входа: `backend-laravel/app/Http/Controllers/Api/DbController.php` (`index`, `DEFAULT_ROWS = 500`, строки 133–213).
- Роут `positions` также существует как ресурс: `routes/api.php:313` (`PositionController`), фронт при этом ходит в generic `/api/db/positions`.
- Глобальный обработчик фаталов с `error_id` — `backend-laravel/bootstrap/app.php`.
