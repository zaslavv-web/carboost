# Backend

Весь серверный код приложения Career Track / Growth Peak.

## Структура

```
backend/
├── supabase/          # Миграции, edge functions, config.toml
│   ├── migrations/    # SQL-миграции БД (накатываются через `supabase db push`)
│   ├── functions/     # Deno Edge Functions
│   └── config.toml    # Конфигурация Supabase CLI
└── deploy/            # Self-host инфраструктура
    ├── docker-compose.full.yml   # Полный стек (Postgres + Auth + REST + Realtime + Storage + Functions + Kong + Caddy + Web)
    ├── docker-compose.proxy.yml  # Лёгкий прокси для обхода блокировок
    ├── Caddyfile / Caddyfile.proxy
    ├── kong.yml                  # API gateway routes
    ├── nginx.conf                # Конфиг nginx для фронтенд-контейнера
    ├── install.sh                # Скрипт автоустановки на VPS
    ├── helm/                     # Helm chart для Kubernetes
    ├── README-selfhost.md        # Инструкция: полный self-host
    └── README-proxy.md           # Инструкция: только реверс-прокси
```

## Важно

> **Lovable Cloud больше НЕ применяет миграции автоматически**, так как папка `supabase/`
> перенесена из корня проекта. Все изменения БД и edge functions нужно деплоить
> вручную через [Supabase CLI](https://supabase.com/docs/guides/cli):
>
> ```bash
> cd backend
> supabase link --project-ref <ref>
> supabase db push
> supabase functions deploy <function-name>
> ```

Файлы `src/integrations/supabase/client.ts` и `src/integrations/supabase/types.ts`
остаются в `src/` — они привязаны к фронтенд-сборке.

## Self-hosting

Полная инструкция: [`deploy/README-selfhost.md`](./deploy/README-selfhost.md)

Быстрый старт:
```bash
cd backend/deploy
cp .env.example .env   # отредактируйте
docker compose -f docker-compose.full.yml up -d
```
