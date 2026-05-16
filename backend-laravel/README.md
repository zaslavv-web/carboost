# Career Track — Laravel 11 backend

Чистый Laravel-проект (без Docker). Файлы, ранее лежавшие в `overlay/`,
теперь находятся прямо в корне `backend-laravel/` и накладываются поверх
стандартного `composer create-project laravel/laravel`.

## Структура

- `.env.example` — шаблон окружения
- `app/` — Models, Controllers, Policies, Services
- `bootstrap/app.php` — bootstrap Laravel 11
- `config/` — переопределения `sanctum.php`, `services.php`, `filesystems.php`
- `database/migrations/` — миграции поверх Supabase-дампа
- `database/seeders/` — сидеры ролей Spatie
- `routes/api.php` — все API-эндпоинты
- `scripts/import-supabase-dump.sh` — импорт дампа Supabase в Postgres

## Запуск без Docker

Требования: PHP 8.3+, Composer 2, Postgres 15+, Redis (опционально), Node 20+ для фронта.

```bash
# 1. Создать свежий Laravel и наложить наши файлы поверх
composer create-project laravel/laravel app-src "11.*"
cp -r app bootstrap config database routes app-src/
cp .env.example app-src/.env

cd app-src
composer require \
  laravel/sanctum laravel/socialite laravel/reverb \
  spatie/laravel-permission predis/predis guzzlehttp/guzzle

php artisan key:generate
php artisan migrate
php artisan db:seed --class=RoleSeeder

# 2. (опционально) импорт боевых данных
bash ../scripts/import-supabase-dump.sh /path/to/careertrack.dump

# 3. Запуск
php artisan serve --host=0.0.0.0 --port=8000
php artisan queue:work &
php artisan reverb:start --host=0.0.0.0 --port=8080 &
```

Прод-деплой — любой PHP-хостинг (nginx + php-fpm, FrankenPHP, Laravel Forge,
ploi.io, Render и т.д.). Фронт собирается отдельно (`npm run build`) и кладётся
за тот же домен с `/api` → Laravel.
