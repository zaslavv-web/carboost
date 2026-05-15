#!/usr/bin/env bash
# ============================================================
# Career Track / Growth Peak — one-liner self-hosted installer
# ============================================================
# Usage (на чистом Ubuntu 22.04+ / Debian 12+):
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/install.sh | sudo bash
# либо локально:
#   sudo bash deploy/install.sh
#
# Что делает скрипт:
#   1. Ставит Docker + Compose plugin (если нет)
#   2. Клонирует репозиторий в /opt/career-track (или обновляет)
#   3. Спрашивает домены / SMTP / Google OAuth
#   4. Генерирует .env c JWT, ANON_KEY, SERVICE_ROLE_KEY
#   5. Поднимает весь стек через docker compose
# ============================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/your-org/career-track.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/career-track}"
BRANCH="${BRANCH:-main}"

log() { printf "\033[1;36m▶ %s\033[0m\n" "$*"; }
err() { printf "\033[1;31m✖ %s\033[0m\n" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "Запустите с sudo"

# 1. Docker
if ! command -v docker &>/dev/null; then
  log "Устанавливаю Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version &>/dev/null || err "Docker Compose plugin не найден"

# 2. Repo
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Обновляю репозиторий в $INSTALL_DIR..."
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  log "Клонирую $REPO_URL → $INSTALL_DIR..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# 3. Конфигурация
ENV_FILE="$INSTALL_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Запрашиваю параметры (можно нажать Enter для пропуска необязательных)..."
  read -rp "Домен фронтенда (app.example.com): " APP_DOMAIN
  read -rp "Домен API/Supabase (api.example.com): " API_DOMAIN
  read -rp "Email для Let's Encrypt: " ADMIN_EMAIL
  read -rp "Google OAuth Client ID (Enter — пропустить): " GOOGLE_CLIENT_ID || true
  read -rsp "Google OAuth Secret: " GOOGLE_SECRET; echo
  read -rp "SMTP host (Enter — пропустить): " SMTP_HOST || true
  read -rp "SMTP user: " SMTP_USER || true
  read -rsp "SMTP pass: " SMTP_PASS; echo
  read -rp "AI gateway URL [https://api.openai.com/v1/chat/completions]: " AI_API_URL
  read -rsp "AI gateway API key: " AI_API_KEY; echo

  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 32)
  REALTIME_SECRET_KEY_BASE=$(openssl rand -hex 32)

  # Генерация ANON / SERVICE_ROLE JWT (HS256)
  gen_jwt() {
    local role="$1"
    python3 - "$role" "$JWT_SECRET" <<'PY'
import sys, json, hmac, hashlib, base64, time
role, secret = sys.argv[1], sys.argv[2].encode()
def b64(x): return base64.urlsafe_b64encode(x).rstrip(b"=").decode()
header  = b64(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(",",":")).encode())
payload = b64(json.dumps({"role":role,"iss":"supabase","iat":int(time.time()),"exp":int(time.time())+10*365*24*3600}, separators=(",",":")).encode())
sig = b64(hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest())
print(f"{header}.{payload}.{sig}")
PY
  }
  ANON_KEY=$(gen_jwt anon)
  SERVICE_ROLE_KEY=$(gen_jwt service_role)

  cat > "$ENV_FILE" <<ENV
# === Domains ===
APP_DOMAIN=$APP_DOMAIN
API_DOMAIN=$API_DOMAIN
SITE_URL=https://$APP_DOMAIN
SUPABASE_PUBLIC_URL=https://$API_DOMAIN
ADDITIONAL_REDIRECT_URLS=https://$APP_DOMAIN/**

# === Postgres / Supabase secrets ===
POSTGRES_DB=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
REALTIME_SECRET_KEY_BASE=$REALTIME_SECRET_KEY_BASE

# === Frontend (Vite) ===
VITE_SUPABASE_URL=https://$API_DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=self-hosted
PROJECT_ID=self-hosted

# === Google OAuth (опционально) ===
GOOGLE_ENABLED=$([[ -n "$GOOGLE_CLIENT_ID" ]] && echo true || echo false)
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_SECRET=$GOOGLE_SECRET

# === SMTP (опционально) ===
SMTP_HOST=$SMTP_HOST
SMTP_PORT=587
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_ADMIN_EMAIL=$ADMIN_EMAIL
MAILER_AUTOCONFIRM=false

# === AI Gateway для Edge Functions ===
AI_API_URL=${AI_API_URL:-https://api.openai.com/v1/chat/completions}
AI_API_KEY=$AI_API_KEY
AI_MODEL=gpt-4o-mini
ENV
  log "Создан $ENV_FILE (сохраните в безопасном месте!)"
else
  log "Использую существующий $ENV_FILE"
fi

# 4. Запуск
log "Собираю и поднимаю стек..."
cd "$INSTALL_DIR/deploy"
docker compose --env-file "$ENV_FILE" -f docker-compose.full.yml pull
docker compose --env-file "$ENV_FILE" -f docker-compose.full.yml up -d --build

log "Готово!"
echo "  Frontend : https://$(grep ^APP_DOMAIN "$ENV_FILE" | cut -d= -f2)"
echo "  API      : https://$(grep ^API_DOMAIN "$ENV_FILE" | cut -d= -f2)"
echo "  Studio   : http://<server-ip>:3001"
echo
echo "Логи:    docker compose -f deploy/docker-compose.full.yml logs -f"
echo "Бэкап:   docker compose exec postgres pg_dump -U postgres postgres | gzip > backup-\$(date +%F).sql.gz"
