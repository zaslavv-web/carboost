# 500 на /api/db/positions и /api/db/career_track_templates — диагностика и починка

## Что уже известно из кода

`DbController@index` ловит только `QueryException` (и превращает её в 400 `invalid_query`). Любая другая ошибка — `\Throwable` (аксессор модели, каст, сериализация в JSON, исчерпание памяти, ошибка политики) — уходит наверх и отдаётся как 500 без деталей. Поэтому по самому ответу невозможно понять причину: нужны строки лога.

Также вне `try` находятся `resolve()` и `authorizeAny('viewAny', ...)` — падение в политике тоже даст «голый» 500.

## Шаг 1. Достать причину из логов (вы уже запустили grep)

Пришлите вывод команды:

```
cd /home/gro7659365/growth-peak.pro/docs/backend
grep -n "api_fatal\|api_memory_high\|db/positions\|career_track_templates\|SQLSTATE" storage/logs/laravel.log | tail -40
```

Если строк нет — значит исключение не долетело до нашего обработчика; тогда:

```
tail -n 120 storage/logs/laravel.log
tail -n 60 /home/gro7659365/growth-peak.pro/logs/error_log 2>/dev/null
```

Что ищем: `api_fatal` (нехватка памяти), `SQLSTATE[42S22]` (нет колонки — расхождение схемы после миграций), `Class ... not found`, `Call to a member function ... on null`.

## Шаг 2. Правки в бэкенде (делаются в любом случае)

1. `DbController@index`: обернуть весь метод (включая `resolve` и `authorizeAny`) в `try/catch (\Throwable)`, логировать `db_index_failed` с таблицей, query string, файлом/строкой и уникальным `error_id`, а клиенту возвращать `{ data: null, error, error_id, code: 'server_error' }` со статусом 500 — но с читаемым телом, чтобы ошибка сразу опознавалась.
2. Такой же обработчик добавить в `store/update/destroy` — сейчас там прикрыт только `QueryException`.
3. Логировать пиковую память запроса при неуспехе (`memory_get_peak_usage`), чтобы отличить «нет колонки» от «упёрлись в лимит».

## Шаг 3. Точечное исправление по найденной причине

- Расхождение схемы (`Unknown column`) → миграция/поправка модели (`$fillable`, `$casts`, имя колонки).
- Память → перевести выборку `positions`/`career_track_templates` на явный список колонок и `DB::table` без гидрации Eloquent, как уже сделано в `headCount` и `ChatController`.
- Ошибка политики → поправить `PositionPolicy` / `CareerTrackTemplatePolicy` для роли, под которой падает.

## Шаг 4. Проверка

- `curl -H "Authorization: Bearer $TOKEN" "https://growth-peak.pro/api/db/positions?select=id,title&order=title.asc"` → 200.
- То же для `career_track_templates`.
- В браузере под HRD открыть «Карьерные треки» — нет 500 и не срабатывает circuit breaker.
