# Бэкенд в CI: коммитим каркас Laravel и делаем сборку воспроизводимой

CI падает, потому что `backend-laravel/` — это overlay (только `app/`, `config/`, `routes/`, `database/`, `tests/`, `bootstrap/app.php`), без `composer.json`, `composer.lock` и `artisan`. Полный Laravel живёт только на боевом сервере, поэтому и тесты, и деплой зависят от того, что уже лежит на хостинге.

## Что делаем

1. Снять эталон с боевого сервера: скопировать оттуда `composer.json` и `composer.lock` (и посмотреть версию PHP), чтобы зафиксировать ровно те версии пакетов, что сейчас работают в проде.
2. Добавить в репозиторий недостающие файлы каркаса Laravel 11: `composer.json`, `composer.lock`, `artisan`, `bootstrap/providers.php`, `public/index.php`, `.gitignore` для `vendor/` и `storage/`, плюс пустые `storage/*` с `.gitkeep`.
3. Прогнать `composer install` и `php artisan test` локально в песочнице (SQLite in-memory уже настроен в `phpunit.xml`), починить то, что всплывёт: отсутствующие сервис-провайдеры, миграции под SQLite, тесты, которые ждут MySQL-специфики.
4. Обновить CI-job «Бэкенд — PHPUnit»: кеш Composer по хэшу `composer.lock`, `--no-scripts` не нужен, добавить `php artisan config:clear` перед тестами и матрицу PHP той же версии, что на проде.
5. Обновить деплой (`.github/workflows/deploy-backend.yml`): доставлять `composer.json`/`composer.lock` на сервер и ставить зависимости через `composer install --no-dev` строго по локу — тогда прод и CI гарантированно совпадают по версиям.

## Как повысить эффективность этого варианта

- **Единый источник правды — `composer.lock`.** Пока лок только на сервере, CI и прод расходятся молча. После коммита лока любое расхождение ловится на этапе PR.
- **Кеш Composer в CI** (`~/.composer/cache` по ключу от `composer.lock`) — прогон падает с ~1–2 мин до ~20 сек.
- **`--prefer-dist --no-progress --no-interaction --no-audit`** и `COMPOSER_NO_AUDIT=1`, как уже сделано в деплое, чтобы CI не падал из-за открытых CVE Laravel 11.x.
- **Разделить тесты на Unit и Feature** (два шага в одном job): unit-падения видно за секунды, не дожидаясь миграций.
- **Проверка целостности overlay**: шаг, который валит job, если `composer.lock` не соответствует `composer.json` (`composer validate --strict`) — это ловит ручные правки на сервере.
- **Совпадение версии PHP** с боевым хостингом (сейчас в CI 8.2) — иначе зелёный CI не гарантирует работоспособность прода.
- **Кешировать `vendor/` не нужно** — кеша Composer достаточно и он не ломается при смене PHP.

## Технические детали

Ожидаемые зависимости по коду: `laravel/framework ^11`, `laravel/sanctum`, `laravel/socialite`, `laravel/reverb`, `spatie/laravel-permission`, `phpoffice/phpspreadsheet`, `guzzlehttp/guzzle`, `predis/predis`; dev: `phpunit/phpunit`, `mockery/mockery`, `fakerphp/faker`, `nunomaduro/collision`. Точный набор и версии берём из серверного `composer.lock`, а не составляем заново.

От вас понадобится один шаг: выполнить на сервере
```text
cd /home/gro7659365/growth-peak.pro/docs/backend && php -v && cat composer.json
```
и прислать вывод (плюс `composer.lock`, если получится) — по нему зафиксируем каркас без риска сломать прод.
