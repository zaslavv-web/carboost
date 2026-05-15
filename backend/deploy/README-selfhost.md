# Career Track / Growth Peak — Self-Hosted (вариант 3)

Полностью автономное развёртывание на собственном сервере в РФ. Никакой
зависимости от `*.supabase.co` / `*.lovable.app` — всё работает без VPN
для российских клиентов.

В стек входит:

- PostgreSQL 15 (с расширениями Supabase)
- GoTrue (Auth, `/auth/v1/*`)
- PostgREST (`/rest/v1/*`)
- Realtime (`/realtime/v1/*`)
- Storage (`/storage/v1/*`)
- **Edge Runtime** (`/functions/v1/*`) — все Edge Functions из `supabase/functions/`
- Supabase Studio (админка БД, порт 3001)
- Kong (API gateway)
- Nginx (фронтенд SPA)
- Caddy (TLS + Let's Encrypt)

---

## 1. Требования к серверу

- Ubuntu 22.04+ / Debian 12+, 2 vCPU / 4 GB RAM / 40 GB SSD (минимум)
- Публичный IPv4
- Два домена/поддомена с A-записями на этот IP:
  - `app.example.com` — фронтенд
  - `api.example.com` — Supabase API (auth/rest/realtime/storage/functions)
- Открытые порты `80` и `443`

---

## 2. Быстрая установка (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/<your-org>/<your-repo>/main/deploy/install.sh | sudo bash
```

Скрипт:
1. Поставит Docker + Compose plugin
2. Склонирует репо в `/opt/career-track`
3. Спросит домены, SMTP, Google OAuth, AI gateway
4. Сгенерирует `.env` с уникальными `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`
5. Соберёт фронт и поднимет весь стек

Альтернативно — вручную:
```bash
git clone <repo> /opt/career-track && cd /opt/career-track
sudo bash deploy/install.sh
```

---

## 3. Перенос данных из Lovable Cloud

### 3.1. Дамп схемы и данных

Из управляемого Supabase (через Studio → Database → Backups, либо `pg_dump`
через временный VPN/прокси с вашей машины):

```bash
pg_dump \
  "postgres://postgres:<PWD>@db.wwmdzrzguicinvxibbqv.supabase.co:5432/postgres" \
  --schema=public --schema=storage --no-owner --no-acl \
  --file=careertrack-dump.sql
```

### 3.2. Восстановление в self-hosted

```bash
scp careertrack-dump.sql root@<server>:/tmp/
ssh root@<server>
docker compose -f /opt/career-track/deploy/docker-compose.full.yml \
  exec -T postgres psql -U postgres -d postgres < /tmp/careertrack-dump.sql
```

### 3.3. Перенос пользователей `auth.users`

```bash
pg_dump "<cloud-url>" --schema=auth --data-only --file=auth.sql
docker compose exec -T postgres psql -U postgres -d postgres < auth.sql
```

> Пароли пользователей переносятся хэшами bcrypt — логин продолжит работать
> с теми же паролями. Главное — использовать **тот же `JWT_SECRET`**, иначе
> старые refresh-токены инвалидируются (это нормально, пользователи
> просто перелогинятся).

### 3.4. Файлы из Storage

```bash
# Скачать бакет через supabase-cli (с VPN)
supabase storage download --recursive ss://<bucket> ./storage-dump
# Загрузить на self-hosted сервер
scp -r storage-dump root@<server>:/var/lib/docker/volumes/career-track_storage-data/_data/
```

---

## 4. Google OAuth

В Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs добавить:
```
https://api.example.com/auth/v1/callback
```

В `.env`:
```
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_SECRET=...
```

Перезапустить auth: `docker compose restart auth`.

---

## 5. Edge Functions

Все функции из `supabase/functions/` автоматически монтируются в контейнер
`functions` (supabase/edge-runtime). Никаких дополнительных деплоев не
нужно — функции вызываются из фронтенда как обычно через
`supabase.functions.invoke('parse-hr-document', ...)`.

Для AI-функций укажите в `.env`:
```
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

(Или любой совместимый OpenAI-style endpoint — например, Yandex GPT
через прокси, или локальный Ollama.)

---

## 6. Резервные копии

```bash
# БД
docker compose exec postgres pg_dump -U postgres postgres | \
  gzip > /backup/db-$(date +%F).sql.gz

# Storage
tar czf /backup/storage-$(date +%F).tar.gz \
  /var/lib/docker/volumes/career-track_storage-data/_data
```

Поставьте в cron раз в сутки.

---

## 7. Обновление кода

```bash
cd /opt/career-track
git pull
docker compose -f deploy/docker-compose.full.yml up -d --build web functions
```

Миграции БД накатываются вручную через Studio (http://server:3001 →
SQL Editor) или:
```bash
docker compose exec -T postgres psql -U postgres -d postgres \
  < supabase/migrations/<новая_миграция>.sql
```

---

## 8. Проверка

После `docker compose up -d`:
- `https://app.example.com` — фронтенд должен открыться
- `https://api.example.com/auth/v1/health` → `{"name":"GoTrue", ...}`
- `https://api.example.com/rest/v1/` → `{"swagger":"2.0", ...}`
- Логин email/пароль и Google должны работать без VPN из РФ

Логи:
```bash
docker compose -f deploy/docker-compose.full.yml logs -f auth rest functions
```

---

## 9. Откат на Lovable Cloud

Если нужно временно вернуться — пересоберите фронт с оригинальными
переменными:
```
VITE_SUPABASE_URL=https://wwmdzrzguicinvxibbqv.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<оригинальный anon key>
```
и опубликуйте через Lovable. Self-hosted стек продолжит работать
параллельно.
