## Цель

Убрать `500 Route [login] not defined` на API-маршрутах под `auth:sanctum` и вернуть корректный JSON-ответ `401` для неавторизованных запросов.

## Причина

Судя по логу, запрос доходит до middleware `auth:sanctum`, но Laravel считает его обычным web-запросом и пытается сделать redirect на named route `login`. В проекте API-only backend, маршрута `login` нет, поэтому вместо нормального `401` получается `500`.

## План изменений

1. **Исправить обработку unauthenticated API-запросов в `bootstrap/app.php`**
   - Добавить явный рендер `Illuminate\Auth\AuthenticationException` для `api/*` и `expectsJson()`.
   - Возвращать JSON:
     ```json
     { "message": "Unauthenticated." }
     ```
     со статусом `401`.
   - Это не затронет авторизованные запросы и не меняет бизнес-логику `assignCompany`.

2. **Не добавлять web-route `login`**
   - Для API это неправильный обходной путь: он спрятал бы проблему редиректа, но не дал бы корректный JSON для frontend.

3. **После выкладки на сервер очистить кеши**
   Выполнить в backend-папке:
   ```bash
   php artisan optimize:clear
   php artisan route:clear
   php artisan config:clear
   php artisan cache:clear
   composer dump-autoload -o
   rm -f bootstrap/cache/routes-v7.php bootstrap/cache/config.php bootstrap/cache/packages.php bootstrap/cache/services.php
   ```

4. **Сбросить OPcache на shared-hosting**
   ```bash
   cat > public/opcache-reset.php <<'PHP'
   <?php
   header('Content-Type: text/plain; charset=utf-8');
   if (function_exists('opcache_reset')) {
       var_dump(opcache_reset());
   } else {
       echo "opcache_reset unavailable\n";
   }
   PHP
   curl -s https://growth-peak.pro/opcache-reset.php
   rm -f public/opcache-reset.php
   ```

5. **Проверить результат**
   ```bash
   curl -s -i -X PATCH https://growth-peak.pro/api/admin/users/test/company
   ```
   Ожидаемо:
   - `HTTP/2 401` или `HTTP/1.1 401`
   - JSON body с `Unauthenticated`
   - не `500`

## Техническая деталь

Изменение нужно внести в `backend-laravel/bootstrap/app.php` в блок `->withExceptions(...)`, чтобы Laravel 11 не пытался строить redirect URL через `route('login')` для API-запросов.