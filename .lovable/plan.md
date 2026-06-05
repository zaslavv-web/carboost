# Почему сейчас не работает

В коде всё корректно:
- `backend-laravel/routes/api.php:136` — `Route::patch('/admin/users/{userId}/company', ...)`
- `UsersController::assignCompany` реализован
- Фронт `src/integrations/laravel/auth.ts` вызывает `PATCH /admin/users/{id}/company`

Но в скриншоте ошибка приходит от **рабочего Laravel-сервера**: `The route api/admin/users/33/company could not be found`. Значит на проде:
1. Не задеплоен свежий `routes/api.php` + `UsersController.php`, **или**
2. Закэширован старый список маршрутов (`bootstrap/cache/routes-v7.php`).

Laravel при включённом route-cache игнорирует новые маршруты до пересборки кэша.

# План

## 1. Передеплоить Laravel-бэкенд и сбросить кэш маршрутов

На сервере (или через `deploy/deploy-laravel.sh`) выполнить:

```bash
cd /path/to/backend-laravel
git pull            # подтянуть свежие routes/api.php и UsersController.php
php artisan route:clear
php artisan config:clear
php artisan cache:clear
php artisan route:cache    # опционально, для прод-производительности
# перезапустить php-fpm / supervisor, если есть OPcache
```

Проверка, что маршрут зарегистрирован:
```bash
php artisan route:list | grep 'admin/users'
```
Ожидаем увидеть строку `PATCH  api/admin/users/{userId}/company`.

## 2. Защитить фронт от непонятного 404

Сейчас при отсутствии маршрута пользователь видит сырое сообщение `The route ... could not be found.`. Добавлю в `UsersManagement.tsx` обработку ошибки `assignCompanyMutation.onError`, чтобы:
- при `status 404` показывать toast «Эндпоинт назначения компании ещё не задеплоен — обновите бэкенд»;
- в остальных случаях показывать локализованное сообщение об ошибке.

Это не чинит сервер, но даёт понятный сигнал, что проблема в деплое, а не в самих данных.

## 3. Проверка после деплоя

1. Открыть страницу «Управление пользователями» под суперадмином.
2. Для пользователя `Anton Lavrenov` (`— Без компании —`) выбрать компанию в дропдауне.
3. Ожидаемо: toast «Компания назначена», профиль обновлён, пользователь после релогина проходит мимо `CompleteRegistration`.

# Технические детали

- Файлы под изменение (только фронт-обработка ошибки): `src/pages/UsersManagement.tsx`.
- Бэкенд-код не меняется — он уже корректен, нужен только деплой и `route:clear`.
- Если деплой автоматический через `deploy/deploy-laravel.sh`, достаточно перезапустить пайплайн; иначе — ручные команды выше.
