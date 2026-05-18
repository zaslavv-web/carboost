#!/usr/bin/env bash
# Production deploy для Laravel-бэкенда на growth-peak.pro.
#
# Использование:
#   ssh deploy@growth-peak.pro 'bash -s' < deploy/deploy-laravel.sh
# или из CI после rsync overlay'я backend-laravel/* в /var/www/api/:
#   deploy/deploy-laravel.sh
#
# Требования на сервере: PHP 8.2+, composer, MySQL/Postgres, supervisor, nginx.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/api}"
PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-composer}"

cd "$APP_DIR"

echo "==> composer install (no-dev, optimized)"
$COMPOSER_BIN install --no-dev --prefer-dist --optimize-autoloader --no-interaction

echo "==> .env проверка"
[ -f .env ] || { echo "FATAL: .env отсутствует в $APP_DIR"; exit 1; }

echo "==> очистка старых кешей Laravel"
$PHP_BIN artisan optimize:clear || true
$PHP_BIN artisan config:clear || true
$PHP_BIN artisan cache:clear || true

echo "==> миграции"
$PHP_BIN artisan migrate --force

echo "==> storage:link (для public-бакетов)"
$PHP_BIN artisan storage:link || true

echo "==> кеш конфигов/маршрутов/вьюх"
$PHP_BIN artisan config:cache
$PHP_BIN artisan route:cache
$PHP_BIN artisan view:cache
$PHP_BIN artisan event:cache

echo "==> очередь и реверб (если включены)"
sudo systemctl reload php8.2-fpm || true
sudo supervisorctl reread || true
sudo supervisorctl update    || true
sudo supervisorctl restart laravel-worker:* 2>/dev/null || true
sudo supervisorctl restart laravel-reverb   2>/dev/null || true

echo "==> nginx reload"
sudo nginx -t && sudo systemctl reload nginx

echo "==> done"
