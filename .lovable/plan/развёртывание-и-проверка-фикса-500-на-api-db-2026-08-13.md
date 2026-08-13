# Развёртывание и проверка фикса 500 на /api/db/*

## Что показала диагностика

- Все миграции применены (последняя — `0031_00_02_000000_dedupe_chat_participants`).
- Схема в порядке: `career_track_templates` существует, у `positions` все 15 колонок на месте, включая `department`.
- В логе причина названа явно: `api_fatal` с `Allowed memory size of 268435456 bytes exhausted` в `Eloquent\Collection` на запросах `db/positions?select=id, title, department` и `db/career_track_templates?select=*`.

То есть это не расхождение схемы и не права, а расход памяти на гидрации Eloquent: широкие JSON-колонки (`psychological_profile`, `competency_profile`, `profile_template`, `steps`) для сотен строк дают многократные копии данных (модель + original + casts + сериализация).

## Что уже сделано в коде (в репозитории, ещё не на сервере)

`app/Http/Controllers/Api/DbController.php`:

1. Чтение переведено на сырой `DB::table` — без гидрации Eloquent. Мультитенантность (`company_id`, superadmin, impersonation) и casts (array/bool/int/float) воспроизведены вручную, формат ответа для фронта не изменился. Eloquent остаётся только когда в `select` запрошены связи вида `alias:relation(...)`.
2. Проекция колонок валидируется по реальной схеме — несуществующие поля (как `body` у `notifications`) отбрасываются вместо SQL-ошибки.
3. Бюджет ответа 4 МБ плюс лимит строк, обрезка помечается флагом `truncated` и строкой `db_index_truncated` в логе.
4. `try/catch (\Throwable)` во всех методах: вместо голого 500 — JSON с `error_id`, в лог пишется `db_index_failed` (файл, строка, пик памяти). 403/404 и `db_busy` пробрасываются как раньше.

## Шаг 1. Выкатить на боевой

```
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan optimize:clear
```

## Шаг 2. Проверка запросов, которые падали

```
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://growth-peak.pro/api/db/positions?select=id,title,department&order=title.asc"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://growth-peak.pro/api/db/career_track_templates?select=*&order=created_at.desc"
```

Ожидаем 200/200.

## Шаг 3. Проверка памяти по логам

```
grep -n "api_fatal\|api_memory_high\|db_index_failed\|db_index_truncated" storage/logs/laravel.log | tail -20
```

- `api_fatal` по этим URI больше быть не должно.
- Если появится `db_index_truncated` — значит выборка реально огромная, и следующий шаг: ограничить набор колонок на фронте (в «Карьерных треках» не тянуть `steps` в списке, грузить их при открытии трека).
- Если появится `db_index_failed` — в строке будет `error_id`, файл и строка: правим уже конкретную причину.

## Шаг 4. Проверка в браузере

Под HRD открыть «Должности» и «Карьерные треки»: экраны загружаются, в консоли нет 500 и не срабатывает circuit breaker (соседние запросы не начинают падать следом).

## Если после выката 500 останется

Значит расход даёт не выборка, а что-то до контроллера. Тогда снимаем профиль на реальном запросе:

```
curl -s -H "Authorization: Bearer $TOKEN" https://growth-peak.pro/api/diag/request-memory; echo
```

и сравниваем `boot_mb` / стадии с `peak_mb` из `api_memory_high` по тому же аккаунту.
