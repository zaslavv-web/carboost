## План

1. Проверить, почему запрос без токена даёт 500 вместо 401.
   - Если маршрут внутри `auth:sanctum`, корректное поведение без авторизации: `401`.
   - `500` до авторизации почти всегда означает проблему Sanctum/таблицы `personal_access_tokens`, route/config cache или OPcache.

2. На сервере снять реальную ошибку из Laravel-лога сразу после тестового PATCH:
   ```bash
   cd /home/gro7659365/growth-peak.pro/docs/backend
   tail -n 120 storage/logs/laravel.log
   ```

3. Очистить Laravel-кеши и пересобрать автозагрузчик:
   ```bash
   php artisan optimize:clear
   php artisan route:clear
   php artisan config:clear
   php artisan cache:clear
   composer dump-autoload -o
   rm -f bootstrap/cache/routes-v7.php bootstrap/cache/config.php bootstrap/cache/packages.php bootstrap/cache/services.php
   ```

4. Сбросить OPcache на shared-hosting без PHP-FPM:
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

5. Повторить проверку:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PATCH https://growth-peak.pro/api/admin/users/test/company
   ```
   Ожидаемый результат без токена: `401`, не `500`.

6. Если всё ещё `500`, прислать последние строки лога. По ним точечно исправим одну из вероятных причин:
   - отсутствует/сломана таблица `personal_access_tokens`;
   - старый скомпилированный кеш всё ещё обслуживается хостингом;
   - ошибка в `EffectiveUser`/Sanctum до входа в `assignCompany`;
   - несовпадение схемы БД после миграций.