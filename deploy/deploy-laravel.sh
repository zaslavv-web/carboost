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
LOG_FILE="${DEPLOY_LOG:-/var/log/laravel-deploy.log}"
GIT_BRANCH="${GIT_BRANCH:-main}"
SKIP_GIT="${SKIP_GIT:-0}"

# Дублируем весь вывод в лог-файл, чтобы автодеплой не падал молча.
if [ -w "$(dirname "$LOG_FILE")" ] || [ -w "$LOG_FILE" ] 2>/dev/null; then
  exec > >(awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush(); }' | tee -a "$LOG_FILE") 2>&1
fi

echo "==> deploy-laravel.sh start (APP_DIR=$APP_DIR, branch=$GIT_BRANCH, skip_git=$SKIP_GIT)"

cd "$APP_DIR"

# Принудительно подтягиваем последний коммит, если рабочая копия — git-репо
# и автосинк не делает этого сам.
if [ "$SKIP_GIT" != "1" ] && [ -d .git ]; then
  echo "==> git fetch + reset --hard origin/$GIT_BRANCH"
  git fetch --all --prune || true
  git reset --hard "origin/$GIT_BRANCH" || true
  git log -1 --oneline || true
fi

# Записываем текущий коммит в VERSION, чтобы /api/diag показывал реальный хэш.
if [ -d .git ]; then
  git rev-parse --short HEAD > VERSION 2>/dev/null || true
  echo "==> VERSION = $(cat VERSION 2>/dev/null || echo unknown)"
fi

echo "==> composer install (no-dev, optimized)"
$COMPOSER_BIN install --no-dev --prefer-dist --optimize-autoloader --no-interaction

echo "==> .env проверка"
[ -f .env ] || { echo "FATAL: .env отсутствует в $APP_DIR"; exit 1; }


echo "==> обязательные production-настройки"
$PHP_BIN <<'PHP'
<?php
$env = parse_ini_file(".env", false, INI_SCANNER_RAW) ?: [];
$required = ["APP_KEY", "APP_URL", "FRONTEND_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "MAIL_HOST", "MAIL_PORT", "MAIL_FROM_ADDRESS"];
$mailer = trim($env["MAIL_MAILER"] ?? "smtp", " \t\n\r\0\x0B\"'");
if ($mailer === "smtp") { $required[] = "MAIL_USERNAME"; $required[] = "MAIL_PASSWORD"; }
$missing = [];
foreach ($required as $key) {
    $value = trim((string)($env[$key] ?? ""), " \t\n\r\0\x0B\"'");
    if ($value === "" || in_array($value, ["change-me", "example", "missing"], true)) $missing[] = $key;
}
if ($missing) {
    fwrite(STDERR, "FATAL: заполните в .env обязательные переменные: " . implode(", ", $missing) . PHP_EOL);
    fwrite(STDERR, "Подсказка: используйте backend-laravel/.env.production.example как шаблон для growth-peak.pro." . PHP_EOL);
    exit(1);
}
PHP

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
$PHP_BIN artisan route:clear
$PHP_BIN artisan route:cache
$PHP_BIN artisan route:list --path=admin/users || true
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
