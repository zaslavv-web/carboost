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

# 1) .env — всегда синхронизируем с .env.production из git,
#    но сохраняем уже сгенерированный APP_KEY, чтобы не разлогинить всех.
if [ -f .env.production ]; then
  EXISTING_APP_KEY=""
  if [ -f .env ]; then
    EXISTING_APP_KEY="$(grep -E '^APP_KEY=' .env | head -n1 | cut -d= -f2-)"
  fi
  cp .env.production .env
  if [ -n "$EXISTING_APP_KEY" ] && [ "$EXISTING_APP_KEY" != "" ]; then
    # подставляем сохранённый APP_KEY обратно
    sed -i.bak -E "s|^APP_KEY=.*|APP_KEY=${EXISTING_APP_KEY}|" .env && rm -f .env.bak
    echo "[deploy] .env обновлён из .env.production (APP_KEY сохранён)"
  else
    echo "[deploy] .env создан из .env.production"
  fi
fi

# 2) APP_KEY
if grep -qE '^APP_KEY=\s*$' .env 2>/dev/null; then
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
