#!/usr/bin/env bash
# Создаёт свежий Laravel 11 в ./app-src, ставит зависимости, копирует overlay/ поверх.
# Идемпотентен: если ./app-src уже существует — только обновляет overlay и зависимости.

set -euo pipefail
cd "$(dirname "$0")/.."

APP_DIR="app-src"
COMPOSER="docker run --rm -v $(pwd):/app -w /app composer:2 composer"

if [ ! -d "$APP_DIR" ]; then
  echo "==> Создаём свежий Laravel 11 в $APP_DIR/"
  $COMPOSER create-project laravel/laravel "$APP_DIR" "11.*" --no-interaction --prefer-dist
else
  echo "==> $APP_DIR/ уже существует, пропускаем create-project"
fi

cd "$APP_DIR"

echo "==> Устанавливаем пакеты"
$COMPOSER require --no-interaction \
  laravel/sanctum \
  laravel/socialite \
  laravel/reverb \
  spatie/laravel-permission \
  predis/predis \
  guzzlehttp/guzzle

echo "==> Публикуем конфиги"
docker run --rm -v "$(pwd):/app" -w /app composer:2 \
  php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider" --force
docker run --rm -v "$(pwd):/app" -w /app composer:2 \
  php artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider" --force
docker run --rm -v "$(pwd):/app" -w /app composer:2 \
  php artisan reverb:install --no-interaction || true

cd ..

echo "==> Копируем overlay/ поверх $APP_DIR/"
cp -rv overlay/. "$APP_DIR/"

echo "==> Генерируем APP_KEY если пусто"
if ! grep -q '^APP_KEY=base64:' "$APP_DIR/.env" 2>/dev/null; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env" 2>/dev/null || true
  docker compose run --rm php-fpm php artisan key:generate --force
fi

echo "==> Кэшируем конфиг"
docker compose run --rm php-fpm php artisan config:cache
docker compose run --rm php-fpm php artisan route:cache
docker compose run --rm php-fpm php artisan storage:link || true

echo "==> Готово. Запустите: docker compose up -d"
