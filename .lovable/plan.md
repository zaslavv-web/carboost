# Что показала проверка прод-сервера

Запросил `GET https://growth-peak.pro/api/diag` и `PATCH /api/admin/users/{id}/company` без авторизации.

## 1. Новый код на сервер НЕ доехал

В репозитории `routes/api.php` диагностика возвращает поля `deploy_marker`, `routes.has_assign_company`, `app_debug` и т.д. (см. `assign-company-route-probe-2026-06-05-01`). На проде эти поля отсутствуют:

```json
{"app_env":"production","php":"8.2.31","laravel":"11.54.0","commit":"unknown","mail":{...},"google":{...},"migrations_tail":[...]}
```

Нет ни `deploy_marker`, ни `routes`, ни `app_debug`. Значит на сервере висит более старая ревизия `routes/api.php` (и, скорее всего, всего бэкенда), чем в репозитории.

## 2. PATCH на смену компании — 500, не 404

```
PATCH https://growth-peak.pro/api/admin/users/test/company
→ HTTP/2 500  {"message":"Server Error"}
```

Если бы маршрут отсутствовал — был бы 404. Значит маршрут зарегистрирован (видимо, в кеше), но обработчик падает ещё до auth-middleware. Скорее всего одно из:

- маршрут `PATCH /admin/users/{userId}/company` есть в кеше `bootstrap/cache/routes-v7.php`, но указывает на старую сигнатуру контроллера / отсутствующий метод;
- либо новый контроллер задеплоен, но `php artisan route:cache` / `config:cache` не пересобраны после деплоя и кеш сломан;
- либо `EnsureHasCompany`/`EffectiveUser` падают на необработанном исключении (видно будет в `storage/logs/laravel.log`).

`app.debug=false`, поэтому подробности скрыты — нужен лог.

# План действий

## Шаг 1. Доставить актуальный код на сервер
Выполнить заново (или довести до конца) деплой бэкенда `backend-laravel`:

```bash
cd /var/www/growth-peak/backend-laravel
git fetch --all && git reset --hard origin/main
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan route:clear && php artisan config:clear && php artisan cache:clear
php artisan route:cache && php artisan config:cache
sudo systemctl reload php8.2-fpm
```

Критично: после деплоя ОБЯЗАТЕЛЬНО `route:clear` ДО `route:cache`. Иначе старый кеш переживёт деплой.

## Шаг 2. Проверить, что код доехал
```bash
curl -s https://growth-peak.pro/api/diag | jq
```
В ответе должны появиться поля `deploy_marker:"assign-company-route-probe-2026-06-05-01"` и `routes.has_assign_company:true`. Если их нет — деплой не сработал.

## Шаг 3. Если 500 остался — снять реальную ошибку
```bash
tail -n 200 /var/www/growth-peak/backend-laravel/storage/logs/laravel.log
```
и прислать последнюю запись со стектрейсом по `assignCompany`. По стектрейсу станет понятно, чинить ли контроллер `UsersController::assignCompany`, миграцию, или middleware.

## Шаг 4. Только после этого править код
Изменения во фронте (`adminAssignCompany` в `src/integrations/laravel/auth.ts`) и контроллере (`backend-laravel/app/Http/Controllers/Api/Admin/UsersController.php::assignCompany`) уже соответствуют контракту `PATCH /admin/users/{userId}/company` с телом `{company_id}`. Менять фронт смысла нет, пока бэкенд возвращает 500 без авторизации.

# Что мне нужно от вас, чтобы продолжить

1. Вывод `curl -s https://growth-peak.pro/api/diag` после повторного деплоя.
2. Хвост `storage/logs/laravel.log` (последние 100–200 строк) на момент воспроизведения ошибки смены компании.
