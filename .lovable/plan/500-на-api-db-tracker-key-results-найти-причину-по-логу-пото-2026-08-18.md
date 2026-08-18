# 500 на /api/db/tracker_key_results — найти причину по логу, потом чинить

## Что известно по коду (проверено сейчас)

- Таблица `tracker_key_results` есть в whitelist `DbController::MODEL_MAP`, модель `TrackerKeyResult`.
- В схеме (`0016_00_00_000000_create_tracker_module_tables.php`) у таблицы нет `company_id` — значит мультитенантный фильтр к ней не применяется, и это не источник SQL-ошибки.
- Запрос идёт «сырым» путём `rawIndex()` (в `select` нет связей). Любая непойманная ошибка там уходит в `serverError()`, который **всегда** пишет в лог строку `db_index_failed` с `error_id`, файлом, строкой и пиком памяти, а в ответе отдаёт JSON с этим `error_id`.

Причина конкретно этого 500 пока не подтверждена — гадать не будем, она уже записана в лог на боевом.

## Шаг 1. Достать причину (без изменений кода)

На боевом:

```
cd /home/gro7659365/growth-peak.pro/docs/backend
grep -n "db_index_failed\|api_fatal\|tracker_key_results" storage/logs/laravel.log | tail -20

[gro7659365@gro7659365 ~]$ cd /home/gro7659365/growth-peak.pro/docs/backend
[gro7659365@gro7659365 backend]$ grep -n "db_index_failed\|api_fatal\|tracker_key_results" storage/logs/laravel.log | tail -20
37790:[2026-08-17 04:11:29] production.ERROR: api_error {"error_id":"9fc7d3c5","uri":"/api/db/tracker_key_results?select=*&order=position.asc&eq.goal_id=a2856f90-c7e5-41b0-860c-bbc49dfa4ec4","method":"GET","user_id":1041,"exception":"Symfony\\Component\\ErrorHandler\\Error\\FatalError","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB"}
37791:[2026-08-17 04:11:29] production.CRITICAL: fatal_request {"message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","method":"GET","uri":"/api/db/tracker_key_results","query":"eq.goal_id=a2856f90-c7e5-41b0-860c-bbc49dfa4ec4&order=position.asc&select=%2A","user":1041,"stage":null,"rows":null,"queries":null,"peak_mb":4.0,"peak_php_mb":1.9,"limit":"1024M"}
37792:[2026-08-17 04:11:50] production.ERROR: api_fatal {"error_id":"114624fc","uri":"/api/db/tracker_key_results?select=*&single=1","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB","memory_limit":"1024M"}
37797:[2026-08-17 04:11:50] production.ERROR: api_error {"error_id":"bbed6705","uri":"/api/db/tracker_key_results?select=*&single=1","method":"POST","user_id":1041,"exception":"Symfony\\Component\\ErrorHandler\\Error\\FatalError","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB"}
37798:[2026-08-17 04:11:50] production.CRITICAL: fatal_request {"message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","method":"POST","uri":"/api/db/tracker_key_results","query":"select=%2A&single=1","user":1041,"stage":null,"rows":null,"queries":null,"peak_mb":4.0,"peak_php_mb":1.9,"limit":"1024M"}
37799:[2026-08-17 04:11:50] production.ERROR: api_fatal {"error_id":"999a122b","uri":"/api/db/tracker_key_results?select=*&single=1","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB","memory_limit":"1024M"}
37804:[2026-08-17 04:11:50] production.ERROR: api_error {"error_id":"3d8dfda6","uri":"/api/db/tracker_key_results?select=*&single=1","method":"POST","user_id":1041,"exception":"Symfony\\Component\\ErrorHandler\\Error\\FatalError","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB"}
37805:[2026-08-17 04:11:50] production.CRITICAL: fatal_request {"message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","method":"POST","uri":"/api/db/tracker_key_results","query":"select=%2A&single=1","user":1041,"stage":null,"rows":null,"queries":null,"peak_mb":4.0,"peak_php_mb":1.9,"limit":"1024M"}
38725:[2026-08-17 07:37:49] production.ERROR: api_fatal {"error_id":"0c061676","uri":"/api/db/tracker_key_results?select=*&order=position.asc&eq.goal_id=a285b981-e308-4c4d-ad5c-cce35bfacf25","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB","memory_limit":"1024M"}
38730:[2026-08-17 07:37:49] production.ERROR: api_error {"error_id":"c5fddfe1","uri":"/api/db/tracker_key_results?select=*&order=position.asc&eq.goal_id=a285b981-e308-4c4d-ad5c-cce35bfacf25","method":"GET","user_id":1259,"exception":"Symfony\\Component\\ErrorHandler\\Error\\FatalError","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB"}
38731:[2026-08-17 07:37:49] production.CRITICAL: fatal_request {"message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","method":"GET","uri":"/api/db/tracker_key_results","query":"eq.goal_id=a285b981-e308-4c4d-ad5c-cce35bfacf25&order=position.asc&select=%2A","user":1259,"stage":null,"rows":null,"queries":null,"peak_mb":4.0,"peak_php_mb":1.9,"limit":"1024M"}
38732:[2026-08-17 07:37:51] production.ERROR: api_fatal {"error_id":"a3eaa382","uri":"/api/db/tracker_key_results?select=*&single=1","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB","memory_limit":"1024M"}
38737:[2026-08-17 07:37:51] production.ERROR: api_error {"error_id":"f11957e9","uri":"/api/db/tracker_key_results?select=*&single=1","method":"POST","user_id":1259,"exception":"Symfony\\Component\\ErrorHandler\\Error\\FatalError","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB"}
38738:[2026-08-17 07:37:51] production.CRITICAL: fatal_request {"message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","method":"POST","uri":"/api/db/tracker_key_results","query":"select=%2A&single=1","user":1259,"stage":null,"rows":null,"queries":null,"peak_mb":4.0,"peak_php_mb":1.9,"limit":"1024M"}
38739:[2026-08-17 07:37:54] production.ERROR: api_fatal {"error_id":"b05d5c85","uri":"/api/db/tracker_key_results?select=*&single=1","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB","memory_limit":"1024M"}
38744:[2026-08-17 07:37:54] production.ERROR: api_error {"error_id":"09afc70d","uri":"/api/db/tracker_key_results?select=*&single=1","method":"POST","user_id":1259,"exception":"Symfony\\Component\\ErrorHandler\\Error\\FatalError","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB"}
38745:[2026-08-17 07:37:54] production.CRITICAL: fatal_request {"message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","method":"POST","uri":"/api/db/tracker_key_results","query":"select=%2A&single=1","user":1259,"stage":null,"rows":null,"queries":null,"peak_mb":4.0,"peak_php_mb":1.9,"limit":"1024M"}
38869:[2026-08-18 07:19:46] production.ERROR: api_fatal {"error_id":"3f44534c","uri":"/api/db/tracker_key_results?select=*&order=position.asc&eq.goal_id=a285b981-e308-4c4d-ad5c-cce35bfacf25","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB","memory_limit":"1024M"}
38874:[2026-08-18 07:19:46] production.ERROR: api_error {"error_id":"32f5e17d","uri":"/api/db/tracker_key_results?select=*&order=position.asc&eq.goal_id=a285b981-e308-4c4d-ad5c-cce35bfacf25","method":"GET","user_id":1259,"exception":"Symfony\\Component\\ErrorHandler\\Error\\FatalError","message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","peak_memory":"4MB"}
38875:[2026-08-18 07:19:46] production.CRITICAL: fatal_request {"message":"Declaration of App\\Policies\\TrackerChildPolicy::isCompanyAdmin(App\\Models\\User $user, $model): bool must be compatible with App\\Policies\\BasePolicy::isCompanyAdmin(App\\Models\\User $user): bool","file":"/home/gro7659365/growth-peak.pro/docs/backend/app/Policies/TrackerChildPolicy.php:49","method":"GET","uri":"/api/db/tracker_key_results","query":"eq.goal_id=a285b981-e308-4c4d-ad5c-cce35bfacf25&order=position.asc&select=%2A","user":1259,"stage":null,"rows":null,"queries":null,"peak_mb":4.0,"peak_php_mb":2.2,"limit":"1024M"}

```

Возможные исходы и что они означают:

- `db_index_failed` с `message` и `where` — обычное исключение, причина названа прямо (например, отсутствующая колонка `position` на боевой схеме, если миграция трекера применена частично).
- `api_fatal` с `Allowed memory size` — снова расход памяти; тогда правка та же, что делали для `positions`.
- Нет ни одной строки — значит 500 отдаёт не контроллер, а слой выше (middleware/аутентификация), и разбираемся по `/api/health` `fatals_last_uri`.

Параллельно я сам проверю схему на боевом:

```
php artisan tinker --execute="print_r(Schema::getColumnListing('tracker_key_results'));"
```

## Шаг 2. Фикс по подтверждённой причине

- **Расхождение схемы** (нет `position`/таблица не мигрирована) — применить недостающую миграцию трекера, плюс в `rawIndex()` игнорировать `order` по несуществующей колонке (сейчас неизвестная колонка отсекается только в `select`, но не в `order` — это реальный пробел и его закроем в любом случае).
- **Память** — добавить `tracker_key_results` в `HOT_TABLE_COLUMNS`, чтобы уйти от `Schema::getColumnListing()` на каждом запросе, как сделано для `positions`/`tracker_tasks`.
- **Ошибка политики** (`TrackerChildPolicy` → `viewAny` = true, здесь падать нечему, но проверим по стеку из лога) — правка точечная по стеку.

## Шаг 3. Устойчивость экрана OKR

Независимо от причины: на фронте загрузка ключевых результатов цели не должна ронять карточку цели — при ошибке показываем цель без KR и неблокирующее сообщение вместо пустого экрана.

## Шаг 4. Проверка

```
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://growth-peak.pro/api/db/tracker_key_results?select=*&order=position.asc&eq.goal_id=a285b981-e308-4c4d-ad5c-cce35bfacf25"
```

Ожидаем 200 и отсутствие новых `db_index_failed` в логе. Затем открываю цель в интерфейсе и подтверждаю, что KR отображаются.

## Технические детали

- Файлы: `backend-laravel/app/Http/Controllers/Api/DbController.php` (валидация `order` по схеме, при необходимости `HOT_TABLE_COLUMNS`), при расхождении схемы — миграция трекера; фронт — компонент карточки цели/KR в модуле трекера.
- Изменений бизнес-логики и схемы данных без подтверждённой причины не делаем.

## Что нужно от вас

Вывод команды `grep` из шага 1 (или доступ к боевому логу) — дальше всё делаю сам.