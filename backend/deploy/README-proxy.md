# Проксирование Supabase через свой домен (обход блокировок)

Это решение позволяет приложению работать в России **без VPN**:
все запросы идут на ваш домен (`growth-peak.pro`), а Caddy на сервере
форвардит их на `*.supabase.co`. Браузер пользователя никогда не
обращается к заблокированным доменам.

## Архитектура

```
Браузер ──HTTPS──▶ growth-peak.pro (ваш VPS, Caddy)
                       │
                       ├── /             → статика SPA (dist/)
                       └── /auth/v1/*    ┐
                           /rest/v1/*    │
                           /storage/v1/* ├─▶ wwmdzrzguicinvxibbqv.supabase.co
                           /realtime/v1/*│
                           /functions/v1/*┘
```

## Шаги развёртывания

### 1. Подготовьте VPS вне зоны блокировок
Любой провайдер с публичным IP (Hetzner, Selectel в РФ, Timeweb Cloud
с зарубежной локацией и т.д.). Установите Docker.

### 2. Соберите фронтенд с правильным URL
В CI или локально:
```bash
VITE_SUPABASE_URL=https://growth-peak.pro \
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi... \
VITE_SUPABASE_PROJECT_ID=wwmdzrzguicinvxibbqv \
npm install
npm run build
```
Получится папка `dist/` — это и есть статика.

### 3. Скопируйте на сервер
```bash
scp -r dist/ deploy/Caddyfile.proxy deploy/docker-compose.proxy.yml \
    user@your-vps:/opt/career-track/
ssh user@your-vps
cd /opt/career-track
mv dist www
```

### 4. Настройте DNS
A-запись `growth-peak.pro` → IP вашего VPS.
(Lovable custom domain в этом сценарии **отключите** — иначе DNS
будет указывать на Lovable вместо вашего сервера.)

### 5. Запустите Caddy
```bash
APP_DOMAIN=growth-peak.pro \
SUPABASE_HOST=wwmdzrzguicinvxibbqv.supabase.co \
docker compose -f docker-compose.proxy.yml up -d
```
Caddy сам получит Let's Encrypt-сертификат при первом запросе.

### 6. Обновите OAuth redirect-URI

В **Google Cloud Console** → OAuth client → Authorized redirect URIs
добавьте:
```
https://growth-peak.pro/auth/v1/callback
```

В **Supabase Dashboard** (или Lovable Cloud → Auth Settings) → URL
Configuration → Redirect URLs добавьте:
```
https://growth-peak.pro
https://growth-peak.pro/**
```
И установите Site URL: `https://growth-peak.pro`.

### 7. Проверьте
Откройте `https://growth-peak.pro` без VPN из РФ. В DevTools →
Network все XHR должны идти на `growth-peak.pro`, а не на supabase.co.

## Обновление приложения

```bash
# Локально
npm run build
scp -r dist/* user@vps:/opt/career-track/www/

# На сервере перезагрузка не нужна — Caddy раздаёт статику напрямую
```

## Откат
Если что-то сломалось — переключите DNS обратно на Lovable
(`185.158.133.1`) и приложение снова заработает в Lovable-хостинге
(но снова потребует VPN из РФ).

## Заметки
- Этот вариант **не требует** self-hosted Supabase — БД и auth
  остаются в Lovable Cloud, всё что вы платите — VPS под Caddy.
- Edge Functions тоже проксируются (`/functions/v1/*`).
- Realtime (WebSocket) работает: Caddy умеет проксировать WS
  по тому же `reverse_proxy`.
- Для масштабирования можно поставить несколько Caddy за балансировщиком.
