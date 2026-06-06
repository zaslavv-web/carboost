## План: докатить обновления и проверить работу

### 1. Подтвердить, что фикс долетел до сервера
На сервере (`/home/gro7659365/growth-peak.pro/docs/backend`):
```bash
git log -1 --oneline
grep -n "redirectGuestsTo\|AuthenticationException" bootstrap/app.php
```
Ожидаем: видим строки `redirectGuestsTo(fn ($request) => null)` и `render(function (\Illuminate\Auth\AuthenticationException`.

### 2. Добавить дублирующий fix в AppServiceProvider (страховка)
Файл `backend-laravel/app/Providers/AppServiceProvider.php` — в `boot()` зарегистрировать:
```php
\Illuminate\Auth\Middleware\Authenticate::redirectUsing(function ($request) {
    if ($request->is('api/*') || $request->expectsJson()) {
        return null;
    }
    return null; // нет /login роута вообще
});
```
Это гарантирует JSON 401 даже если `bootstrap/app.php` будет перезаписан старой версией из `bootstrap.sh`.

### 3. Деплой на сервер
```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan optimize:clear
rm -f bootstrap/cache/*.php
php artisan config:cache
php artisan route:cache
sudo systemctl reload php8.2-fpm
```

### 4. Проверка
```bash
# должен вернуть 401 JSON, не 500
curl -s -i -X PATCH https://growth-peak.pro/api/admin/users/test/company

# логи должны быть пустыми по этому запросу
tail -n 40 storage/logs/laravel.log

# проверка авторизованного запроса (с реальным токеном)
curl -s -i https://growth-peak.pro/api/auth/me -H "Authorization: Bearer <TOKEN>"
```

### 5. Smoke-тест фронта
Открыть https://growth-peak.pro, залогиниться, проверить:
- логин/регистрация работают
- Superadmin → UsersManagement → смена компании пользователю (тот самый PATCH /admin/users/{id}/company) проходит без 500
- Dashboard загружается без ошибок в Network tab

### Ожидаемый результат
- `PATCH /api/admin/users/test/company` без токена → `401 {"message":"Unauthenticated."}` 
- Никаких `Route [login] not defined` в `laravel.log`
- Фронт работает end-to-end

### Технические детали
Корень проблемы: `Authenticate` middleware при отсутствии токена пытается построить redirect URL через `route('login')`, которого в API-only бэкенде нет → `RouteNotFoundException` → 500 вместо 401. Два слоя защиты: `redirectGuestsTo` в `bootstrap/app.php` + `Authenticate::redirectUsing()` в `AppServiceProvider` (на случай, если `bootstrap.sh` перезатрёт первый файл).
