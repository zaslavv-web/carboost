#!/usr/bin/env bash
# Production deploy для React-фронтенда Growth Peak.
#
# Что делает:
#   1. git fetch + reset --hard origin/$GIT_BRANCH в корне репозитория,
#   2. npm ci (или npm install, если lock-файла нет),
#   3. npm run build → dist/,
#   4. atomically копирует dist/ в WEB_ROOT (nginx / usr/share/nginx/html).
#
# Использование (на growth-peak.pro):
#   cd /path/to/repo && deploy/deploy-frontend.sh
# или удалённо:
#   ssh deploy@growth-peak.pro 'bash -s' < deploy/deploy-frontend.sh
#
# Требования на сервере: Node.js >= 20, npm, права записи в WEB_ROOT
# (или запуск скрипта под соответствующим пользователем / sudo).

set -euo pipefail

# Каталог с исходниками фронта (корень репозитория, где лежит package.json + vite.config.ts).
FRONT_DIR="${FRONT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
# Куда nginx смотрит index.html (см. deploy/nginx.conf → root /usr/share/nginx/html).
WEB_ROOT="${WEB_ROOT:-/usr/share/nginx/html}"
GIT_BRANCH="${GIT_BRANCH:-main}"
SKIP_GIT="${SKIP_GIT:-0}"
NPM_BIN="${NPM_BIN:-npm}"
LOG_FILE="${DEPLOY_LOG:-/var/log/frontend-deploy.log}"

if [ -w "$(dirname "$LOG_FILE")" ] || [ -w "$LOG_FILE" ] 2>/dev/null; then
  exec > >(awk '{ print strftime("[%Y-%m-%d %H:%M:%S]"), $0; fflush(); }' | tee -a "$LOG_FILE") 2>&1
fi

echo "==> deploy-frontend.sh start (FRONT_DIR=$FRONT_DIR, WEB_ROOT=$WEB_ROOT, branch=$GIT_BRANCH)"

cd "$FRONT_DIR"

# Убедиться, что мы в корне React-проекта, а не в backend-laravel/.
if [ ! -f package.json ] || ! grep -q '"vite"' package.json; then
  echo "FATAL: $FRONT_DIR не выглядит как корень React-фронта (нет vite в package.json)."
  echo "       Установите FRONT_DIR=<путь к корню репозитория> и повторите."
  exit 1
fi

if [ "$SKIP_GIT" != "1" ] && [ -d .git ]; then
  echo "==> git fetch + reset --hard origin/$GIT_BRANCH"
  git fetch --all --prune
  git reset --hard "origin/$GIT_BRANCH"
  git log -1 --oneline
fi

# Проставляем VERSION для /diag и футеров.
if [ -d .git ]; then
  git rev-parse --short HEAD > public/VERSION 2>/dev/null || true
fi

# Node/npm sanity-check.
if ! command -v "$NPM_BIN" >/dev/null 2>&1; then
  echo "FATAL: npm не найден. Установите Node.js 20+ (например, через nvm) и повторите."
  exit 1
fi

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  echo "FATAL: требуется Node.js >= 20 (сейчас: $(node -v 2>/dev/null || echo none))."
  exit 1
fi

echo "==> установка зависимостей"
if [ -f package-lock.json ]; then
  $NPM_BIN ci --no-audit --no-fund
elif [ -f bun.lock ] && command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile
else
  $NPM_BIN install --no-audit --no-fund
fi

echo "==> vite build"
$NPM_BIN run build

if [ ! -d dist ]; then
  echo "FATAL: dist/ не создан — сборка провалилась."
  exit 1
fi

echo "==> публикация в $WEB_ROOT"
if [ ! -d "$WEB_ROOT" ]; then
  echo "FATAL: WEB_ROOT=$WEB_ROOT не существует."
  exit 1
fi

# Атомарная замена: сначала rsync в staging, потом swap.
STAGING="${WEB_ROOT}.new"
BACKUP="${WEB_ROOT}.bak"

rm -rf "$STAGING"
mkdir -p "$STAGING"
rsync -a --delete dist/ "$STAGING/"

rm -rf "$BACKUP"
if [ -d "$WEB_ROOT" ] && [ "$(ls -A "$WEB_ROOT" 2>/dev/null)" ]; then
  mv "$WEB_ROOT" "$BACKUP"
fi
mv "$STAGING" "$WEB_ROOT"

echo "==> reload nginx"
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl reload nginx || nginx -s reload || true
else
  nginx -s reload || true
fi

echo "==> готово. Bundle: $(du -sh "$WEB_ROOT" | cut -f1). Prev backup: $BACKUP"
