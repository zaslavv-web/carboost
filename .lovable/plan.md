# Починка деплоя: route:cache падает из-за дубля имён маршрутов

## Что происходит

Файл `routes/api.php` подключается дважды: один раз штатно (`/api/*`) и второй раз в блоке `then:` как версионированный алиас (`/api/v1/*`). Все `Route::apiResource(...)` внутри генерируют именованные маршруты (`notifications.index` и т.д.), поэтому при втором подключении имена повторяются. Пока кеш маршрутов не строится, Laravel это терпит, но `php artisan route:cache` требует уникальных имён и падает:

```text
Unable to prepare route [api/v1/notifications] for serialization.
Another route has already been assigned name [notifications.index].
```

Из-за этого весь шаг деплоя завершается с кодом 1 (миграции и сиды при этом уже отработали успешно).

## Решение

Дать группе `api/v1` собственный префикс имён, чтобы алиас не конфликтовал с основным набором:

- В `backend-laravel/bootstrap/app.php`, в блоке `then:`, добавить `->name('v1.')` к группе `Route::prefix('api/v1')->middleware('api')`.
- URL-контракт не меняется: `/api/*` и `/api/v1/*` продолжают работать одинаково. Меняются только внутренние имена дублирующей группы (`v1.notifications.index` и т.п.), которые нигде во фронтенде не используются — фронт ходит по URL.

## Проверка

- Локально/на сервере: `php artisan route:clear && php artisan route:cache` должен пройти без ошибок.
- `php artisan route:list --path=notifications` покажет обе группы с разными именами.
- После пуша GitHub Actions прогонит деплой целиком, включая health-check с проверкой версии.

## Технические детали

Изменяется один файл — `backend-laravel/bootstrap/app.php` (одна строка в замыкании `then`). Миграций и изменений контроллеров не требуется.
