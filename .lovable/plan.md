## Контекст

Toast «Эндпоинт назначения компании ещё не задеплоен на бэкенде» означает, что `PATCH /api/admin/users/{userId}/company` всё ещё возвращает 404 с прод-бэкенда (`growth-peak.pro`, `/var/www/api`).

В репозитории всё корректно:

- `backend-laravel/routes/api.php:136` — маршрут зарегистрирован внутри `auth:sanctum + effective.user`-группы.
- `backend-laravel/app/Http/Controllers/Api/Admin/UsersController.php::assignCompany` существует.
- `bootstrap/app.php` корректно регистрирует алиасы `effective.user`, `verified.user`, `has.company`.
- `deploy/deploy-laravel.sh` делает `optimize:clear` → `route:cache`, чего достаточно, чтобы новый маршрут попал в кеш.
- Маркер-коммит в `routes/api.php` уже сделан в прошлой итерации.

Значит, либо авто-синхронизация не подхватила коммит, либо `deploy-laravel.sh` не отрабатывает после `git pull`, либо на сервере другой код/ветка. Без выхода на сервер мы это не увидим — нужно либо данные с сервера, либо новый коммит, который точно триггерит пайплайн и оставляет след.

## План

### 1. Проверить, какой коммит реально работает на проде

Эндпоинт `/api/diag` уже возвращает поле `commit` из `backend-laravel/VERSION`. Попросить (или сделать самим curl-запросом из браузера от пользователя) обратиться к:

```
https://growth-peak.pro/api/diag
```

и сравнить `commit` с `HEAD` репозитория. Если значения отличаются — авто-синхронизация не работает / не запускалась.

### 2. Триггер-коммит с пробным маршрутом

Добавить в `backend-laravel/routes/api.php` рядом с публичным блоком короткий read-only debug-маршрут:

```php
Route::get('/admin/_route_check', fn () => response()->json([
    'has_assign_company' => collect(\Route::getRoutes())->contains(
        fn ($r) => $r->uri() === 'api/admin/users/{userId}/company'
            && in_array('PATCH', $r->methods(), true),
    ),
    'commit' => trim(@file_get_contents(base_path('VERSION')) ?: 'unknown'),
]));
```

После авто-деплоя дернуть `https://growth-peak.pro/api/admin/_route_check`:

- `has_assign_company: true` → значит проблема не в кеше маршрутов, а где-то ещё (например, в проде стоит другой `routes/api.php`, или nginx проксирует не туда).
- 404 на самом `_route_check` → авто-синхронизация не подтянула новый коммит / `route:cache` не пересобрался.

### 3. Подстраховка деплой-скрипта (если он реально запускается, но кеш мешает)

В `deploy/deploy-laravel.sh` перед `route:cache` явно добавить `route:clear`:

```diff
 echo "==> кеш конфигов/маршрутов/вьюх"
 $PHP_BIN artisan config:cache
+$PHP_BIN artisan route:clear
 $PHP_BIN artisan route:cache
```

Это безопасно и страхует от ситуации, когда старый кеш по какой-то причине не перетирается.

### 4. После починки убрать диагностику

Когда подтвердим, что route есть и `assignCompany` работает:

- удалить маршрут `_route_check` и маркер-комментарий из `routes/api.php`;
- убрать спец-обработку 404 в `assignCompanyMutation.onError` в `src/pages/UsersManagement.tsx`, оставив только обычный `toast.error(msg)`.

## Что меняется в коде

- `backend-laravel/routes/api.php` — +1 публичный GET `/admin/_route_check` (временно).
- `deploy/deploy-laravel.sh` — +1 строка `route:clear`.
- Фронт не трогаем до подтверждения.

## Что нужно от пользователя

Один из двух вариантов:

1. Прислать ответ `curl https://growth-peak.pro/api/diag` (поле `commit` и `migrations_tail`), либо
2. После следующего деплоя открыть `https://growth-peak.pro/api/admin/_route_check` и прислать JSON.

Это однозначно покажет, в чём проблема: в авто-синхронизации, в кеше маршрутов или в чём-то ещё.
