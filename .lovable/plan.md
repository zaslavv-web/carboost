# Найти реальную причину 500 на боевом сервере

## Что уже точно известно (проверено сейчас, боевой сервер)

- Backend обновлён: `/api/health` отдаёт `version: 2737ec0`, `memory_limit: 1024M`, `db: ok`, ответ за 0.15 с.
- `/api/diag/db-probe` под боевым HRD-токеном отдаёт 500 через **9.1 с** — ровно как `/api/profiles`, `/api/db/positions`, `/api/db/departments`.
- В `DiagController` каждый шаг обёрнут в `try/catch (\Throwable)`, и весь метод обёрнут ещё раз. Значит это **не исключение**: PHP-исключения были бы пойманы и вернули бы 200 с описанием шага.
- `/api/health` показывает `fatals_last_hour: 26`, `fatals_last_uri: /api/diag/db-probe` — то есть срабатывает fatal-handler (память или таймаут выполнения), а такие ошибки `try/catch` не ловит.
- `table_counts` в health сейчас сломан: `Undefined property: stdClass::$table_name` (запрос написан не под текущую СУБД), поэтому размеры таблиц мы не видим.

Вывод: падает не «конкретный SQL» и не логика контроллера, а сам процесс PHP — до возврата ответа. Стабильные 9 с у всех эндпоинтов = либо `max_execution_time` (~10 с), либо ожидание соединения с БД, либо memory-fatal. Пока какой именно — **не подтверждено**, и угадывать больше не будем.

## Что делаем

### 1. Сделать причину видимой (без изменения бизнес-логики)

- Новый endpoint `/api/diag/last-fatal`: отдаёт последние записанные fatal-события целиком — `message`, `file:line`, `uri`, `peak_memory`, `execution_time`. Сейчас health хранит только счётчик и URI.
- В fatal-handler дописать сохранение полного `error_get_last()` + `memory_get_peak_usage(true)` + прошедшее время запроса.
- Новый endpoint `/api/diag/limits`: `max_execution_time`, `memory_limit`, `mysql.connect_timeout`, `default_socket_timeout`, значения из `php.ini` веб-SAPI, а также `SHOW VARIABLES` по `wait_timeout`, `max_user_connections`, `max_connections` и `SHOW STATUS` по `Threads_connected`.
- Починить `table_counts` в `/api/health` под фактическую СУБД, чтобы увидеть реальные размеры `profiles`, `positions`, `departments`, `tracker_tasks`.

### 2. Пошаговые «маячки», переживающие fatal

`db-probe` переписывается так, чтобы перед каждым шагом писать маркер (шаг + время + память) в файл `storage/logs/probe.jsonl` с немедленным сбросом на диск. Даже если процесс умрёт от таймаута/памяти, последний записанный маркер точно назовёт шаг-убийцу. Читать маркеры — через `/api/diag/last-probe`.

Дополнительно в probe добавляются изолированные шаги:
- «пустой» шаг без БД (проверка, что дело вообще в БД),
- `SELECT 1` на дефолтном соединении,
- `SELECT 1` на каждом настроенном соединении из `config/database.php` (если их несколько — вероятная причина 9 с: попытка подключения ко второй, недоступной БД с таймаутом),
- время самого `DB::connection()->getPdo()` (установка соединения отдельно от запроса).

### 3. Прогон и вывод

После деплоя я под боевым HRD-токеном вызываю `/api/diag/limits`, `/api/diag/db-probe`, затем `/api/diag/last-probe` и `/api/diag/last-fatal`, и показываю конкретный шаг + конкретный лимит, который упирается. Только после подтверждённой причины делается сам фикс — отдельным шагом, без «пробных» правок вслепую.

## Что потребуется от вас

Один деплой backend после моих правок:

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull origin main
php artisan config:clear && php artisan route:clear
php artisan config:cache && php artisan route:cache
```

Дальше всё измеряю я сам, ваших действий не требуется.

## Технические детали

- Файлы: `app/Http/Controllers/Api/DiagController.php` (расширение), `routes/api.php` (3 новых read-only маршрута в группе `auth:sanctum` + `effective.user`), обработчик fatal в `bootstrap/app.php` (расширение payload), `routes/api.php` health-блок (исправление `table_counts`).
- Все новые маршруты только на чтение, за аутентификацией, никакой бизнес-логики и схемы БД не трогают.
- Маркеры пишутся в `storage/logs/probe.jsonl` с ротацией по последним 200 строкам.
