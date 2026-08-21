# Composer lock несовместим с PHP 8.2 на проде и в CI

CI ставит PHP 8.2, прод — 8.2.33, а `backend-laravel/composer.lock` собран под PHP 8.3: в него попали `maennchen/zipstream-php 3.2.2` (требует php-64bit ^8.3), `laravel/pint v1.30.5` (php ^8.3) и `phpoffice/phpspreadsheet 2.4.7`, который тянет тот самый zipstream. Поэтому `composer install` падает ещё до установки.

## Что делаем

1. В `backend-laravel/composer.json` фиксируем целевую платформу, чтобы Composer больше никогда не разрешал зависимости под 8.3:
   ```text
   "config": { "platform": { "php": "8.2.33" } }
   ```
   Это единственный надёжный способ: без него любой `composer update` на машине с 8.3 снова сломает прод.
2. Прижимаем проблемные пакеты к последним версиям, поддерживающим 8.2:
   - `phpoffice/phpspreadsheet` — версия ветки, совместимая с `zipstream-php ^3.1` под PHP 8.2 (подберём точную по `composer why-not`);
   - `laravel/pint` — понизить ограничение до версии с `php ^8.2`.
3. Пересобираем `composer.lock` в песочнице с PHP 8.2 (`composer update --prefer-dist`) и коммитим новый лок.
4. Прогоняем `composer install --no-interaction --prefer-dist` и `php artisan test` в песочнице — убеждаемся, что 107 тестов по-прежнему зелёные и Excel-экспорт (`phpspreadsheet`) не сломался.
5. Добавляем в CI-job «Бэкенд — PHPUnit» шаг `composer validate --strict` и явную проверку платформы, чтобы расхождение PHP ловилось на PR, а не на деплое.

## Альтернатива (если хотите PHP 8.3)

Если хостинг умеет переключать PHP на 8.3, можно вместо понижения пакетов поднять версию PHP на проде и в CI (`php-version: "8.3"` в `.github/workflows/tests.yml` и `npm-publish.yml`) и оставить текущий лок. Это перспективнее, но требует проверки прода на 8.3.

## Технические детали

Меняются только `backend-laravel/composer.json`, `backend-laravel/composer.lock` и `.github/workflows/tests.yml`. Код приложения не трогаем. `zipstream-php` используется только внутри phpspreadsheet (экспорт XLSX), поэтому понижение затрагивает выгрузки отчётов — их проверим тестом на экспорт.
