# Портирование Career Track на собственный сервер

Этот документ описывает полный перенос проекта с Lovable Cloud на
**self-hosted Supabase + nginx (Docker) на VPS** с сохранением всех пользователей и данных.

> Дальнейшие правки в Git автоматически попадают в боевой продукт через настроенный CI/CD.

---

## 0. Что уже сделано в коде (готово к деплою)

| Что было | Стало |
|---|---|
| `lovable.auth.signInWithOAuth("google")` в `Login.tsx` | `supabase.auth.signInWithOAuth({ provider: "google" })` — работает с любыми Supabase OAuth credentials |
| Edge Functions хардкодили `LOVABLE_API_KEY` и URL Lovable AI | Все читают `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` (с фолбэком на `LOVABLE_API_KEY`) |
| Хостинг только на `.lovable.app` | Добавлены `Dockerfile`, `deploy/nginx.conf`, `docker-compose.yml` |
| Конфиг разбросан | `.env.example` с описанием всех переменных |

> ⚠️ Файл `src/integrations/lovable/index.ts` оставлен — он автогенерируемый и больше нигде не используется, после переезда его можно удалить.

---

## 1. Поднятие Self-Hosted Supabase

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# → отредактируйте .env: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
#   SITE_URL, ADDITIONAL_REDIRECT_URLS, SMTP_*
docker compose pull
docker compose up -d
```

После старта будут доступны:
- **Postgres**: `localhost:5432`
- **REST/Auth (Kong gateway)**: `http://localhost:8000` → закройте за nginx + TLS как `https://api.example.com`
- **Studio**: `http://localhost:3000`

---

## 2. Перенос данных (включая пользователей)

### 2.1. Дамп с Lovable Cloud

Так как прямой `pg_dump` к Lovable Cloud недоступен по сети, используйте один из вариантов:

**Вариант A — через Lovable Backend UI** (Cloud → Database → Tables → Export)
Экспортирует только `public.*` таблицы в CSV. **Не подойдёт**, потому что не уносит `auth.users` и пароли.

**Вариант B — попросить нас сделать дамп через `pg_dump` в задаче поддержки Lovable.**
Это рекомендованный путь: команда Lovable выгружает полный `pg_dump --clean --if-exists` (включая `auth`, `storage`, `public`), отдаёт `.sql.gz`.

```bash
# то, что нужно запросить:
pg_dump \
  --schema=public --schema=auth --schema=storage \
  --no-owner --no-privileges \
  -Fc -f careertrack.dump \
  $LOVABLE_DB_URL
```

### 2.2. Restore в self-hosted Supabase

```bash
# 1) Остановите внешние подключения к новой БД
docker compose exec db psql -U postgres -c \
  "ALTER DATABASE postgres SET default_transaction_read_only = off;"

# 2) Накатите дамп
docker compose exec -T db pg_restore \
  -U postgres -d postgres \
  --clean --if-exists --no-owner --no-privileges \
  < careertrack.dump

# 3) Перезапустите Auth/Storage чтобы они подхватили новые таблицы
docker compose restart auth storage rest realtime
```

> **Пароли пользователей сохраняются** — `auth.users.encrypted_password` использует bcrypt, и GoTrue (auth-сервис Supabase) проверяет тот же формат.
> **Активные сессии — нет.** Все пользователи будут разлогинены и должны войти заново. Это ожидаемо.

### 2.3. Настройте JWT secret = тому же, что в дампе

В `auth.users` нет JWT, но **публикуемые анон/сервис-ключи завязаны на `JWT_SECRET`**. Чтобы сохранить тот же `anon key`, нужно либо использовать тот же `JWT_SECRET` (нельзя, он у Lovable), либо **сгенерировать новые ключи** и обновить `.env` фронта (см. §3).

---

## 3. Настройка фронта на свой бэкенд

```bash
cp .env.example .env
# отредактируйте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY
# (берутся из supabase/docker/.env: SUPABASE_PUBLIC_URL и ANON_KEY)
```

---

## 4. Google OAuth на своих credentials

1. **Google Cloud Console** → APIs & Services → Credentials → **Create OAuth client ID** → Web application.
2. **Authorized redirect URIs**: `https://api.example.com/auth/v1/callback`
   *(точно та же схема и домен, что у `VITE_SUPABASE_URL` + путь `/auth/v1/callback`)*
3. Возьмите Client ID и Client Secret.
4. В **Supabase Studio** (`http://localhost:3000`) → Authentication → Providers → Google → вставьте ID/Secret → Enable → Save.
5. В **Authentication → URL Configuration**:
   - Site URL: `https://app.example.com`
   - Redirect URLs: `https://app.example.com/`, `https://app.example.com/complete-registration`

Готово — кнопка «Войти через Google» в `Login.tsx` уже использует `supabase.auth.signInWithOAuth` и заработает автоматически.

---

## 5. AI-функции (Edge Functions)

В каталоге `supabase/functions/.env` (или через `supabase secrets set`) пропишите:

```
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=sk-xxxx
AI_MODEL=gpt-4o-mini
```

Поддерживается любой OpenAI-совместимый шлюз (OpenAI, OpenRouter, Azure, vLLM, Ollama).
Для обратной совместимости, если задан только `LOVABLE_API_KEY` — он используется как `AI_API_KEY`.

Деплой:

```bash
cd /path/to/project
supabase link --project-ref <local-ref>          # или используйте прямой docker exec
supabase functions deploy --no-verify-jwt
```

---

## 6. Деплой фронта

```bash
docker compose build
docker compose up -d
```

Контейнер слушает `:8080`. Поставьте перед ним nginx/Traefik с Let's Encrypt и натравите домен `app.example.com → localhost:8080`.

### CI/CD из Git
В рабочем продукте уже настроен прямой шлюз Git → прод. На сервере достаточно:

```bash
# git post-receive hook или GitHub Actions runner
cd /opt/careertrack && git pull
docker compose build --no-cache web
docker compose up -d web
```

---

## 7. Чек-лист после миграции

- [ ] `https://app.example.com` открывается, нет ошибок CORS
- [ ] Логин email/password работает (старые пароли валидны)
- [ ] Google OAuth ведёт на правильный redirect и возвращается в приложение
- [ ] В Studio таблицы `profiles`, `companies`, `user_roles` содержат старые данные
- [ ] Edge Functions отвечают (проверить через любую AI-фичу: AI Assessment / Generate Career Paths)
- [ ] RLS политики действуют (попробовать читать чужие данные — должно быть запрещено)
- [ ] Realtime подписки (`messages`, etc.) приходят

---

## 8. Что важно помнить при дальнейших правках

1. **Никогда не возвращать `lovable.auth`** — только `supabase.auth.*`.
2. **Все AI-вызовы** идут через `AI_API_URL` / `AI_API_KEY`. Не хардкодить URL.
3. **Миграции БД** живут в `supabase/migrations/*.sql` — на проде накатываются командой `supabase db push` или `psql -f`.
4. **Секреты** не коммитим. Только `.env.example`.
