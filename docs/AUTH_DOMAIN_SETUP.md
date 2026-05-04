# Подключение авторизации к домену

Инструкция описывает, как настроить вход в систему (Email + Google OAuth) для приложения **Пик Роста / Career Track** на собственном домене (self-hosted Supabase + фронт на VPS / nginx).

> Для Lovable-хостов (`*.lovable.app`, `*.lovable.dev`) ничего настраивать не нужно — там работает managed Google OAuth от Lovable Cloud. Эта инструкция нужна только для **собственного домена** и **self-hosted Supabase**.

---

## 0. Что должно быть готово до начала

- Развёрнут self-hosted Supabase (Docker, по `DEPLOYMENT.md`).
- Куплен домен, например `growth-peak.pro` (фронт) и `auth.growth-peak.pro` (Supabase Auth / Kong).
- DNS A-записи указывают на ваш VPS.
- На VPS установлен nginx + получен SSL (например, через `certbot`).
- Фронт собран (`docker compose up -d frontend`) и доступен по `https://growth-peak.pro`.
- Supabase (Kong) доступен по `https://auth.growth-peak.pro`.

---

## 1. Переменные окружения фронта

В `.env` (рядом с `docker-compose.yml`) укажите URL вашего self-hosted Supabase и его anon-ключ:

```env
VITE_SUPABASE_URL=https://auth.growth-peak.pro
VITE_SUPABASE_PUBLISHABLE_KEY=<anon ключ из supabase/.env>
VITE_SUPABASE_PROJECT_ID=self-hosted
```

Пересоберите фронт:

```bash
docker compose build frontend
docker compose up -d frontend
```

Проверьте в браузере DevTools → Network: запросы должны идти на `https://auth.growth-peak.pro/auth/v1/...`, а не на `*.supabase.co`.

---

## 2. Настройка Supabase Auth (Site URL и Redirect URLs)

В файле `supabase/.env` (или через Studio → Authentication → URL Configuration) задайте:

```env
SITE_URL=https://growth-peak.pro
ADDITIONAL_REDIRECT_URLS=https://growth-peak.pro/,https://growth-peak.pro/complete-registration,https://growth-peak.pro/reset-password
```

Перезапустите Auth-контейнер:

```bash
docker compose restart auth
```

> Без правильных `SITE_URL` / `ADDITIONAL_REDIRECT_URLS` Supabase отклонит OAuth-редирект с ошибкой `redirect_to is not allowed`.

---

## 3. Email + пароль

В `supabase/.env`:

```env
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=false   # пользователь подтверждает email
```

Настройте SMTP (любой провайдер: Postmark, SES, Mailgun, Yandex SMTP):

```env
GOTRUE_SMTP_HOST=smtp.yourprovider.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=...
GOTRUE_SMTP_PASS=...
GOTRUE_SMTP_ADMIN_EMAIL=no-reply@example.com
GOTRUE_SMTP_SENDER_NAME=Пик Роста
```

Перезапустите: `docker compose restart auth`.

После этого работают:
- регистрация по email/паролю,
- письма с подтверждением,
- сброс пароля (`/reset-password`),
- приглашения новых пользователей (через **Управление пользователями → Создать пользователя**).

---

## 4. Google OAuth (свои credentials)

### 4.1. Google Cloud Console

1. Откройте https://console.cloud.google.com/ → создайте проект (или выберите существующий).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: `Пик Роста`.
   - Authorized domains: `growth-peak.pro`.
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Name: `Career Track Web`.
   - **Authorized JavaScript origins**:
     ```
     https://growth-peak.pro
     https://auth.growth-peak.pro
     ```
   - **Authorized redirect URIs** (callback Supabase Auth):
     ```
     https://auth.growth-peak.pro/auth/v1/callback
     ```
4. Сохраните **Client ID** и **Client Secret**.

### 4.2. Supabase

В `supabase/.env`:

```env
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<Client ID>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<Client Secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://auth.growth-peak.pro/auth/v1/callback
```

Перезапустите Auth:

```bash
docker compose restart auth
```

### 4.3. Проверка

1. Откройте `https://growth-peak.pro/login`.
2. Нажмите **«Войти через Google»**.
3. Должен открыться экран Google → выбор аккаунта → возврат на `https://growth-peak.pro/`.

В DevTools → Console приложение пишет структурированные логи:

```
[auth.oauth] start { mode: "supabase-direct", provider: "google", ... }
[auth.oauth] redirected_to_provider { via: "supabase" }
```

Если получаете `Unsupported provider: missing OAuth secret` — значит `GOTRUE_EXTERNAL_GOOGLE_*` не подхватились (опечатка в имени переменной или контейнер не перезапущен).

---

## 5. Конфигурация nginx (фронт)

Минимальный блок в `deploy/nginx.conf` (уже есть в репозитории):

```nginx
server {
  listen 443 ssl http2;
  server_name growth-peak.pro;

  ssl_certificate     /etc/letsencrypt/live/growth-peak.pro/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/growth-peak.pro/privkey.pem;

  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback — иначе deep-link на /complete-registration вернёт 404
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Для Supabase (Kong) — отдельный server-блок с `proxy_pass http://kong:8000`, не забудьте `proxy_set_header Host $host`.

---

## 6. Чек-лист после настройки

- [ ] `https://growth-peak.pro` открывает приложение.
- [ ] Email/password регистрация → приходит письмо подтверждения.
- [ ] Сброс пароля работает, `/reset-password` открывается.
- [ ] Кнопка «Войти через Google» уводит на `accounts.google.com` и возвращает обратно с активной сессией.
- [ ] В Supabase Studio → Authentication → Users появляются новые записи.
- [ ] Суперадмин может верифицировать пользователей и создавать новых через **Управление пользователями**.

---

## 7. Частые проблемы

| Симптом | Причина | Решение |
|---|---|---|
| `Unsupported provider: missing OAuth secret` | Не заданы `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID/SECRET` | Добавить в `supabase/.env`, `docker compose restart auth` |
| `redirect_to is not allowed` | URL не в `ADDITIONAL_REDIRECT_URLS` | Добавить `https://growth-peak.pro/*` адреса, перезапустить auth |
| Google: `redirect_uri_mismatch` | URI не совпадает с тем, что в Google Console | Прописать точно `https://auth.growth-peak.pro/auth/v1/callback` |
| После Google входа редиректит на `localhost` | `SITE_URL` не задан | Указать `SITE_URL=https://growth-peak.pro` |
| 404 при обновлении страницы `/dashboard` | Нет SPA fallback в nginx | Добавить `try_files $uri /index.html;` |
| Письма не приходят | SMTP не настроен | Заполнить `GOTRUE_SMTP_*`, проверить порт/TLS |

---

## 8. Безопасность

- Никогда не коммитьте `supabase/.env` и `.env` фронта в git.
- Для прода держите `GOTRUE_MAILER_AUTOCONFIRM=false` — пользователь подтверждает email.
- `SERVICE_ROLE_KEY` используйте **только** в edge-функциях (например, `admin-create-user`), никогда не отдавайте на фронт.
- Включите HSTS и `Strict-Transport-Security` в nginx.
- Регулярно ротируйте Google Client Secret и anon/service-role ключи.
