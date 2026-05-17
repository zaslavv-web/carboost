#!/usr/bin/env bash
# ============================================================
# deploy.sh — выполнять на сервере после `git pull` в backend-laravel/
# ============================================================
# Что делает:
#   1) Подтягивает свежий .env (если ещё нет — копирует из .env.production)
#   2) Генерирует APP_KEY, если пустой
#   3) Сбрасывает и пересобирает кэш конфига/маршрутов/вью
#   4) Прогоняет миграции
#   5) Перезапускает очередь
#
# Запуск:
#   cd /path/to/backend-laravel && bash deploy.sh
# ============================================================

set -euo pipefail

cd "$(dirname "$0")"

# 1) .env
if [ ! -f .env ] && [ -f .env.production ]; then
  cp .env.production .env
  echo "[deploy] .env создан из .env.production"
fi

# 2) APP_KEY
if grep -q '^APP_KEY=$' .env 2>/dev/null; then
  php artisan key:generate --force
  echo "[deploy] APP_KEY сгенерирован"
fi

# 3) Cache
php artisan config:clear
php artisan cache:clear
php artisan route:clear
php artisan view:clear
php artisan config:cache
php artisan route:cache
echo "[deploy] кэш пересобран"

# 4) Миграции
php artisan migrate --force
echo "[deploy] миграции применены"

# 5) Очередь
php artisan queue:restart
echo "[deploy] очередь перезапущена"

echo "[deploy] готово ✅"
