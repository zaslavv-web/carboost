## Что означает сообщение

Тост «Приглашения не созданы» появляется в `src/pages/Invitations.tsx:82` строго при условии `created + updated === 0`. То есть бэкенд ответил 200 OK, но в ответе `data.created = 0` и `data.updated = 0`. Значит запрос дошёл, авторизация/`company_id` прошли (иначе был бы 401/403/422 с `missing_company` и другим текстом), но ни одна строка в `employee_invitations` не была ни вставлена, ни обновлена.

В `RpcController::bulkInviteEmployees` `created`/`updated` могут остаться нулевыми только по одному из веток:

1. Список `_invites` пуст или не массив → фронт уже фильтрует пустые email, но если все email без «@», `cleaned.length === 0` бросается ещё до запроса. Значит на сервер уходит непустой массив - то есть, ошибка написания почты? - тогда нужно выводить соответствующий аллерт
2. Каждая строка отвалилась на `filter_var(FILTER_VALIDATE_EMAIL)` → идёт в `skipped`, `errors[].error = 'Некорректный email'`.
3. Существует запись со статусом `claimed` для этого email в этой компании → `skipped`, `errors[].error = 'Пользователь уже принял приглашение'`.
4. Существует `pending` запись и `UPDATE` кинул исключение → `skipped`, `errors[].error = <SQL error>`.
5. Новая запись, `INSERT` кинул исключение (нарушение уникального индекса, NOT NULL, FK, тип id) → `skipped`, `errors[].error = <SQL error>`.

Во всех этих сценариях фронт покажет тот же тост «Приглашения не созданы», но перед ним отработает `firstError` — конкретное сообщение первой ошибки. Значит либо `errors` пуст (тогда виноват путь 1 — сервер получил пустой массив), либо в `errors[0].error` уже лежит настоящая причина, и её нужно прочитать в тосте / DevTools.

## Гипотезы, отсортированные по вероятности

1. `**INSERT` падает на уникальном индексе `employee_invitations.email` (без учёта `company_id`)**. Ранее мы уже снимали уникальный индекс на `company_id`, но не проверяли, что нет глобального `unique(email)` или `unique(token_hash)`. Если ранее сидер/тест создал запись с тем же email в другой компании — новый INSERT падает, `created` остаётся 0. Первая ошибка в `errors[]` — «Duplicate entry … for key …».
2. **Все email из формы уже висят как `pending` в этой компании после предыдущих неуспешных попыток**, и `UPDATE` теперь падает (например, из-за отсутствия колонок `token`/`token_hash` или `updated_at` на этой инсталляции, или NOT NULL на `full_name`/`position_id`). Тогда обе ветки → `skipped`, и в `errors[0]` — реальный SQL-текст.
3. `**INSERT` падает из-за отсутствия поля `id**` — на MySQL/Postgres с UUID-колонкой без DEFAULT и веткой `idColumnIsInteger` возвращающей `true` там, где на самом деле колонка `char(36)`/`uuid`. `id` не подставляется, SQL кидает «Field 'id' doesn't have a default value». `created = 0`.
4. **NOT NULL на `token`/`token_hash`/`requested_role`/`updated_at`, но миграция на проде не докатилась** (например, добавление `token_hash` было позже). Тогда каждый INSERT падает с «Column ... cannot be null».
5. **Фронт отправил пустой `_invites**`: пользователь нажал «Отправить» не введя валидные email или ввёл только пробелы/строку без `@`. Тогда `cleaned.length === 0` должен был выкинуть локальный toast «errorNoValidEmail», но если в `InviteRow[]` попал email с «@» из плейсхолдера — попадём в `filter_var` → все `skipped`, тост «Приглашения не созданы, пропущено: N».
6. **Роль актора не проходит `hasRole([...])**` — но это отдаёт 403 «Недостаточно прав», а не 200 c нулями. Маловероятно.
7. `**company_id` актора найден, но не совпадает с `company_id` позиций, на которые ссылается `invite.position_id**` — FK constraint падает при INSERT. Первая ошибка: «Cannot add or update a child row: a foreign key constraint fails».
8. **Триггер/наблюдатель в БД (например, `before insert` в MySQL или RLS-политика в Postgres, если проект перевели на PG)** блокирует вставку и молча возвращает 0 строк. В логах Laravel будет warning от QueryException.
9. **Транзакция откатилась целиком из-за исключения в одной итерации до того, как мы обернули INSERT/UPDATE в try/catch** — но текущий код уже ловит `Throwable` внутри цикла, откат возможен только если исключение выкидывается вне try (например, `Str::uuid()` при отсутствующем ext-uuid, `Schema::hasColumn` при разорванном соединении). Маловероятно, но проявится как `errors = []`, `created = 0`.
10. **Кэш маршрутов/конфига на проде указывает на старый `RpcController**` (до фикса `requested_role`), и в реальности сервер отвечает старой сигнатурой без `updated`/`mailed`. Фронт видит `created = 0`, `updated = 0` → тост. Проверяется `php artisan route:list | grep rpc` и хэшом файла.

## План диагностики (последовательно, без изменений кода)

1. Открыть DevTools → Network → POST `/api/rpc/bulk_invite_employees`, посмотреть тело ответа.
  - Если `errors: []` и `created:0` — гипотезы 1/9/10 (запрос дошёл, но ничего не выполнилось).
  - Если `errors: [{ error: "..." }]` — читать текст: это сразу отбрасывает 8 из 10 гипотез.
2. На сервере: `tail -n 200 storage/logs/laravel.log` во время повторной попытки — увидим `SQLSTATE[...]` или warning из `sendInvitationMail`.
3. Проверить схему таблицы: `SHOW CREATE TABLE employee_invitations` (MySQL) или `\d employee_invitations` (PG). Ищем:
  - уникальные индексы, кроме `(company_id, email)`;
  - `NOT NULL` без DEFAULT на `id`, `token`, `token_hash`, `updated_at`, `requested_role`;
  - тип `id` (integer/uuid/char).
4. Проверить залипшие записи: `SELECT status, count(*) FROM employee_invitations WHERE company_id = ? AND email IN (...)`. Если много `pending` — сработает ветка UPDATE и покажет истинную SQL-ошибку.
5. Убедиться, что на проде актуальный код: `git rev-parse HEAD` в `/home/gro7659365/growth-peak.pro/docs/backend` и `php artisan route:list --path=rpc`.

## Что сделаю после диагностики

По результатам сетевого ответа и логов выберу один из фиксов:

- снять/переделать уникальный индекс на `email` → миграция `unique(company_id, email)`;
- добавить недостающие DEFAULT/nullable на колонки `employee_invitations`;
- починить генерацию `id` в `RpcController::bulkInviteEmployees` (явный UUID/автоинкремент по типу колонки);
- если проблема в фронте (все email отфильтровались) — усилить валидацию и текст тоста, показывая, что именно ушло на сервер.

Никаких правок пока не делаю — сначала жду от вас содержимое ответа Network (Response) на POST `bulk_invite_employees` и/или последние 100 строк `storage/logs/laravel.log` после нажатия «Пригласить».  
напиши команду поиска по всей базе  электронной почты   
  
