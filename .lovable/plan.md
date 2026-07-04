## Что случилось

Кнопка «удалить» в списке компаний физически удалила **все** компании. Данные в PostgreSQL (Laravel backend) — Lovable откатить их не может.

Я нашёл **корневую причину бага** — и это не разовый глюк, любое удаление/обновление/чтение через `/api/db/{table}` может снести все строки.

## Корневая причина (важно)

Фронт вызывает:

```
DELETE /api/db/companies?eq.id=<uuid>
```

В `backend-laravel/app/Http/Controllers/Api/DbController.php::applyFilters` условие:

```php
foreach ($request->query() as $key => $value) {
    if (! str_contains($key, '.')) continue;   // ← ключ ожидается "eq.id"
    [$op, $col] = explode('.', $key, 2);
    ...
}
```

PHP автоматически заменяет `.` в именах query-параметров на `_` при заполнении `$_GET` (легаси-поведение register_globals). Symfony/Laravel читают `$request->query()` именно оттуда → ключ приходит как `eq_id`, а не `eq.id`. Условие `str_contains($key, '.')` = false → **фильтр не применяется** → в `destroy()` `$query->get()` возвращает все компании → foreach удаляет их все (у company_admin FK каскадные, потому даже «непустые» падали).

Совпадает с симптомом «удалил пустую компанию → удалились все»: у неё каскад отработал без FK-ошибок, остальные тоже слетели.

Тот же баг влияет на `update()` и на `index()` (выборка). Просто до сих пор никто не удалял.

## План исправления

### 1. Восстановление данных

Продовые данные в вашей БД PostgreSQL. Восстановить можно:

- **Если у хостинга есть автобэкап Postgres до момента удаления** — накатить его (обычно `pg_restore` из панели хостинга). Это единственный способ вернуть реальные данные.
- **Если данные были демо-компанией** — просто пересеять:
  ```
  php artisan demo:seed --reset --name="Demo_Doom" --headcount=150
  ```

Уточните после — какой сценарий у вас.

### 2. Фикс бага в DbController (backend-laravel)

Файл `backend-laravel/app/Http/Controllers/Api/DbController.php`:

**a) Парсить фильтры из сырого query string, а не из `$_GET`:**

Вместо `foreach ($request->query() as $key => $value)` разобрать `$request->server('QUERY_STRING')` вручную, чтобы точки в ключах не терялись:

```php
$raw = (string) $request->server('QUERY_STRING');
$pairs = [];
foreach (explode('&', $raw) as $chunk) {
    if ($chunk === '') continue;
    [$k, $v] = array_pad(explode('=', $chunk, 2), 2, '');
    $pairs[urldecode($k)][] = urldecode($v);
}
foreach ($pairs as $key => $values) {
    if (! str_contains($key, '.')) continue;
    [$op, $col] = explode('.', $key, 2);
    foreach ($values as $value) {
        // тот же switch по op, что сейчас
    }
}
```

**b) Жёсткий предохранитель против массового удаления/обновления:**

В `destroy()` и `update()` — если после `applyFilters` в `$query` не осталось ни одного `where`, вернуть `422` с ошибкой, а не выполнять запрос. Это защитит даже от будущих регрессий:

```php
if (empty($query->getQuery()->wheres)) {
    return response()->json([
        'error' => 'Отказ: массовое удаление/обновление без фильтров запрещено',
    ], 422);
}
```

**c) Дополнительно** — для таблицы `companies` в `destroy` требовать явный фильтр по `id` (чтобы даже фильтр по `name.ilike=...` не мог случайно снести компанию).

### 3. Regression-тест

Добавить PHP-тест `tests/Feature/DbControllerDestroyTest.php`:
- DELETE `/api/db/companies` без фильтров → 422, ничего не удалено.
- DELETE `/api/db/companies?eq.id=<real-id>` → удаляет ровно 1 запись, остальные на месте.

## Итог

- **Сейчас:** ответьте, реальные это данные или демо — от этого зависит, восстанавливать из бэкапа Postgres или пересеивать.
- **Дальше:** переключимся в build mode и я внесу правки в `DbController` + тест, чтобы это никогда не повторилось.
