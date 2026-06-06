## План

1. **Убрать корневую причину на уровне Laravel bootstrapping**
   - Обновить `backend-laravel/bootstrap/app.php`, чтобы Laravel не регистрировал callback редиректа гостей на `route('login')`.
   - Вместо этого для API-запросов сразу возвращать JSON `401 {"message":"Unauthenticated."}`.

2. **Сделать защиту устойчивее, чем текущий handler исключения**
   - Текущий `AuthenticationException` handler срабатывает слишком поздно: ошибка возникает раньше, когда middleware пытается вычислить redirect URL через `route('login')`.
   - Поэтому нужно настроить middleware guest redirect через `redirectGuestsTo(...)`, чтобы для `api/*` он возвращал `null`, а не `route('login')`.

3. **Не добавлять web route `/login`**
   - Это замаскирует проблему и даст HTML/redirect-поведение там, где API должен возвращать JSON.

4. **После деплоя на сервере проверить именно backend-файл**
   - `grep -n "redirectGuestsTo\|AuthenticationException" bootstrap/app.php`
   - Сейчас `grep` пустой, значит исправленный `bootstrap/app.php` не оказался в активной backend-директории `/home/gro7659365/growth-peak.pro/docs/backend`.

5. **Очистить кеш и проверить результат**
   - `php artisan optimize:clear`
   - `rm -f bootstrap/cache/*.php`
   - Повторить:
     - `curl -s -i -X PATCH https://growth-peak.pro/api/admin/users/test/company`
   - Ожидаемый ответ без токена: `HTTP 401`, JSON `{"message":"Unauthenticated."}`, без `Route [login] not defined` в логе.

## Техническая правка

В `bootstrap/app.php` внутри `->withMiddleware(function (Middleware $middleware) { ... })` добавить настройку guest redirect для API-only backend:

```php
$middleware->redirectGuestsTo(function ($request) {
    if ($request->is('api/*') || $request->expectsJson()) {
        return null;
    }

    return null;
});
```

И оставить текущий `AuthenticationException` JSON-render как дополнительную страховку.