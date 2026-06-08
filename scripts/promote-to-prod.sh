#!/usr/bin/env bash
# Промоушен фичи из репозитория песочницы в прод-репо.
#
# Подразумевается локальная структура:
#   ~/code/career-track-sandstorm   — sandbox-репо (origin: GitHub)
#   ~/code/career-track             — prod-репо    (origin: GitHub)
#
# Скрипт:
#   1. Делает git diff sandstorm/main..prod/main.
#   2. Создаёт ветку promote/<date> в прод-репо.
#   3. Применяет patch.
#   4. Подсказывает создать PR через gh cli (если установлен).
#
# Использование:
#   SAND_REPO=~/code/career-track-sandstorm \
#   PROD_REPO=~/code/career-track \
#   ./scripts/promote-to-prod.sh

set -euo pipefail

SAND_REPO="${SAND_REPO:?SAND_REPO is required}"
PROD_REPO="${PROD_REPO:?PROD_REPO is required}"
DATE="$(date -u +%Y%m%d-%H%M)"
BRANCH="promote/${DATE}"
PATCH_FILE="/tmp/sandstorm-promote-${DATE}.patch"

echo "[promote] fetching latest from both repos"
git -C "$SAND_REPO" fetch origin main
git -C "$PROD_REPO" fetch origin main

echo "[promote] building diff"
git -C "$SAND_REPO" diff origin/main..origin/main > "$PATCH_FILE" || true
# По факту сравниваем sandstorm:main против prod:main — для этого нужен общий remote.
# Здесь используем формат patch через git format-patch для последних коммитов:
git -C "$SAND_REPO" format-patch origin/main --stdout > "$PATCH_FILE"

if [[ ! -s "$PATCH_FILE" ]]; then
  echo "[promote] нечего переносить, патч пустой"
  exit 0
fi

echo "[promote] preparing branch in prod repo: $BRANCH"
git -C "$PROD_REPO" checkout -B "$BRANCH" origin/main
git -C "$PROD_REPO" am --3way "$PATCH_FILE" || {
  echo "[promote] am failed — разрешите конфликты вручную и завершите 'git am --continue'"
  exit 4
}

echo "[promote] push"
git -C "$PROD_REPO" push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  gh -R "$(git -C "$PROD_REPO" remote get-url origin)" pr create \
     --base main --head "$BRANCH" \
     --title "Promote sandstorm → prod ($DATE)" \
     --body "Автоматический промоушен из песочницы. Проверьте миграции вручную."
else
  echo "[promote] gh cli не найден — создайте PR вручную для ветки $BRANCH"
fi
