## Контекст

Код бэкенда уже в репозитории:
- `backend-laravel/routes/api.php:136` — `PATCH /admin/users/{userId}/company`
- `backend-laravel/app/Http/Controllers/Api/Admin/UsersController.php::assignCompany`

На сервере включена автосинхронизация с git, значит push нового коммита запустит пайплайн `deploy/deploy-laravel.sh`, который сам сделает `composer install`, `optimize:clear`, `migrate`, `route:cache` и перезапустит php-fpm. Отдельных ручных действий на сервере не нужно.

Проблема в том, что прошлый деплой, судя по 404 в проде, прошёл без сброса route-cache (или вообще не подхватил новый `routes/api.php`). Нужно гарантированно дёрнуть пайплайн ещё раз и заодно подстраховаться на фронте.

## План

### 1. Принудительный ре-деплой Laravel

Закоммитить безопидный no-op в `backend-laravel/`, чтобы git-hook на сервере увидел изменение и прогнал `deploy/deploy-laravel.sh`:

- Обновить `backend-laravel/routes/api.php` — добавить комментарий-маркер над блоком admin-маршрутов с датой и кратким описанием (`// redeploy: ensure PATCH /admin/users/{userId}/company is registered`).

Это пересоберёт route-cache (`php artisan route:cache` в `deploy-laravel.sh`, шаг «кеш конфигов/маршрутов/вьюх») и зарегистрирует `assignCompany`.

### 2. Защитить фронт от прежней ошибки

В `src/pages/UsersManagement.tsx` обработчик `assignCompanyMutation.onError` уже добавлен в прошлой итерации — он показывает понятный toast при 404. Перепроверить, что:
- сообщение по-русски и не дублируется;
- после успешного `mutate` инвалидируется кэш списка пользователей.

Если расхождений нет — файл не трогаем.

### 3. Проверка после авто-деплоя

1. Подождать прохода пайплайна (обычно 1–2 мин).
2. В UI «Управление пользователями» под суперадмином назначить компанию пользователю `Anton Lavrenov`.
3. Ожидаемо: toast «Компания назначена», в `profiles.company_id` появится UUID, пользователь после релогина минует `CompleteRegistration`.

Если снова 404 — значит auto-sync не подхватил коммит, тогда нужно будет руками дёрнуть `deploy/deploy-laravel.sh` или проверить webhook.

## Технические детали

Изменяемые файлы:
- `backend-laravel/routes/api.php` — добавить однострочный комментарий-маркер (no-op для рантайма, но триггерит git-hook).
- `src/pages/UsersManagement.tsx` — только если найдём расхождение с п.2 (скорее всего, не нужно).

Бэкенд-логика не меняется: контроллер и маршрут уже корректны.
