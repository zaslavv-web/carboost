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

[gro7659365@gro7659365 backend]$ grep -n "api_fatal\|api_memory_high\|db/positions\|career_track_templates\|SQLSTATE" storage/logs/laravel.log | tail -40

34868:[2026-08-13 10:50:51] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

34931:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35004:[2026-08-13 10:50:53] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35059:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35124:[2026-08-13 10:50:53] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35179:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35244:[2026-08-13 10:50:53] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35299:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35364:[2026-08-13 10:50:56] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35427:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35500:[2026-08-13 10:50:56] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35555:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35620:[2026-08-13 10:50:57] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35675:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35740:[2026-08-13 10:51:00] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35795:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35860:[2026-08-13 10:51:00] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

35923:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

35996:[2026-08-13 10:51:04] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

36051:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

36116:[2026-08-13 10:51:06] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

36179:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

36252:[2026-08-13 10:51:11] production.ERROR: SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) {"exception":"[object] (Illuminate\\Database\\QueryException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections (Connection: mysql, SQL: select * from `personal_access_tokens` where `personal_access_tokensid` = 189 limit 1) at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connection.php:825))

36315:[previous exception] [object] (PDOException(code: 1203): SQLSTATE[HY000] [1203] User gro7659365_grow already has more than 'max_user_connections' active connections at /home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Connectors/Connector.php:66))

36388:[2026-08-13 10:52:02] production.WARNING: DbController query failed {"table":"notifications","query":"[eq.is](http://eq.is)_read=false&eq.user_id=7&order=created_at.desc&select=id%2Ctitle%2Cbody%2Curl%2Ccreated_at%2Cis_read%2Ctype","sql":"SQLSTATE[42S22]: Column not found: 1054 Unknown column 'body' in 'field list' (Connection: mysql, SQL: select `id`, `title`, `body`, `url`, `created_at`, `is_read`, `type` from `notifications` where `user_id` = 7 and `is_read` = false order by `created_at` desc)"}

36409:[2026-08-13 15:35:59] production.ERROR: api_fatal {"error_id":"e59e5222","uri":"/api/chats","message":"Allowed memory size of 268435456 bytes exhausted (tried to allocate 8388608 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Collections/Collection.php:399","peak_memory":"250MB","memory_limit":"256M](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Collections/Collection.php:399","peak_memory":"250MB","memory_limit":"256M)"}

36410:[2026-08-13 18:37:55] production.WARNING: api_memory_high {"uri":"/api/analytics/ingest","method":"POST","user_id":null,"status":202,"peak_mb":132.0,"limit":"256M"}

36411:[2026-08-13 18:37:57] production.ERROR: api_fatal {"error_id":"2724a4e3","uri":"/api/chats/unread-count","message":"Allowed memory size of 268435456 bytes exhausted (tried to allocate 4096 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:260","peak_memory":"256MB","memory_limit":"256M](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:260","peak_memory":"256MB","memory_limit":"256M)"}

36412:[2026-08-13 18:45:11] production.ERROR: api_fatal {"error_id":"d9776272","uri":"/api/db/notifications?select=id&count=exact&head=1&eq.user_id=1259&[eq.is](http://eq.is)_read=false","message":"Allowed memory size of 268435456 bytes exhausted (tried to allocate 8388608 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Collections/Collection.php:141","peak_memory":"250MB","memory_limit":"256M](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Collections/Collection.php:141","peak_memory":"250MB","memory_limit":"256M)"}

36413:[2026-08-13 18:48:55] production.WARNING: api_memory_high {"uri":"/api/analytics/ingest","method":"POST","user_id":null,"status":202,"peak_mb":132.0,"limit":"256M"}

36416:[2026-08-13 19:15:29] production.WARNING: api_memory_high {"uri":"/api/chats/unread-count","method":"GET","user_id":1259,"status":200,"boot_mb":64.0,"entry_mb":64.0,"handler_mb":64.0,"peak_mb":128.0,"limit":"256M"}

36418:[2026-08-13 19:18:59] production.ERROR: api_fatal {"error_id":"5df15afa","uri":"/api/db/positions?select=id%2C+title%2C+department&order=title.asc","message":"Allowed memory size of 268435456 bytes exhausted (tried to allocate 4096 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:262","peak_memory":"256MB","memory_limit":"256M](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:262","peak_memory":"256MB","memory_limit":"256M)"}

36419:[2026-08-13 19:19:01] production.ERROR: api_fatal {"error_id":"d9307536","uri":"/api/db/career_track_templates?select=*&order=created_at.desc","message":"Allowed memory size of 268435456 bytes exhausted (tried to allocate 4096 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:262","peak_memory":"256MB","memory_limit":"256M](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:262","peak_memory":"256MB","memory_limit":"256M)"}

36421:[2026-08-13 19:19:04] production.WARNING: api_memory_high {"uri":"/api/auth/me","method":"GET","user_id":null,"status":200,"boot_mb":64.0,"entry_mb":64.0,"handler_mb":62.0,"peak_mb":126.0,"limit":"256M"}

36423:[2026-08-13 19:19:04] production.WARNING: api_memory_high {"uri":"/api/profiles/me","method":"GET","user_id":1259,"status":200,"boot_mb":64.0,"entry_mb":64.0,"handler_mb":60.0,"peak_mb":124.0,"limit":"256M"}

36425:[2026-08-13 19:19:04] production.WARNING: api_memory_baseline {"uri":"/api/db/positions?select=id%2C+title%2C+department&order=title.asc","boot_mb":62.0,"entry_mb":62.0,"limit":"256M"}

36426:[2026-08-13 19:19:06] production.ERROR: api_fatal {"error_id":"364f25a7","uri":"/api/db/positions?select=id%2C+title%2C+department&order=title.asc","message":"Allowed memory size of 268435456 bytes exhausted (tried to allocate 4096 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:260","peak_memory":"256MB","memory_limit":"256M](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:260","peak_memory":"256MB","memory_limit":"256M)"}

36427:[2026-08-13 19:19:08] production.ERROR: api_fatal {"error_id":"0227abce","uri":"/api/db/career_track_templates?select=*&order=created_at.desc","message":"Allowed memory size of 268435456 bytes exhausted (tried to allocate 4096 bytes)","file":"/home/gro7659365/[growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:262","peak_memory":"256MB","memory_limit":"256M](http://growth-peak.pro/docs/backend/vendor/laravel/framework/src/Illuminate/Database/Eloquent/Collection.php:262","peak_memory":"256MB","memory_limit":"256M)"}

36429:[2026-08-13 19:20:28] production.WARNING: api_memory_high {"uri":"/api/analytics/ingest","method":"POST","user_id":null,"status":202,"boot_mb":64.0,"entry_mb":64.0,"handler_mb":90.0,"peak_mb":154.0,"limit":"256M"}

36431:[2026-08-13 19:21:21] production.WARNING: api_memory_high {"uri":"/api/analytics/ingest","method":"POST","user_id":null,"status":202,"boot_mb":64.0,"entry_mb":64.0,"handler_mb":76.0,"peak_mb":140.0,"limit":"256M"}

&nbsp;

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