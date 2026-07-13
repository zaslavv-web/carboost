# Growth Peak (Career Track)

HR-tech платформа развития сотрудников. Мультитенантная, 5 ролей, on-premise.

## Структура репозитория (целевая, план `.lovable/plan.md`)

```text
/
├─ core/                 # корневой API (Laravel 11)          → rtfm_core_api.md
├─ services/             # микросервисы
│  ├─ ai/                # LLM / RAG / чат-оценка              → rtfm_ai.md
│  ├─ chat/              # мессенджер + Reverb WS              → rtfm_chat.md
│  ├─ analytics/         # People Analytics, риски, comfort    → rtfm_analytics.md
│  ├─ automation/        # авто-назначения, эскалации          → rtfm_automation.md
│  ├─ notifications/     # e-mail / webhooks / iCal            → rtfm_notifications.md
│  ├─ gamification/      # магазин наград, ledger              → rtfm_gamification.md
│  └─ ingest/            # Storage, парсинг оргструктуры, GeoIP → rtfm_ingest.md
├─ apps/
│  └─ web/               # SPA (React + Vite)                   → rtfm_web.md
├─ deploy/               # nginx, docker-compose, systemd
├─ docs/                 # общая архитектура и on-prem
└─ scripts/              # backup / restore / promote
```

Каждая папка сервиса содержит `rtfm_<name>.md` (единый шаблон: назначение, переменные окружения, инфопотоки, связь с ядром, эндпоинты, запуск, тесты) и `.env.example`.

### Текущее состояние
- **Каркас и rtfm-документация** — созданы (`core/rtfm_core_api.md`, `services/*/rtfm_*.md`, `apps/web/rtfm_web.md`).
- **Физический код** — ещё в `backend-laravel/` и `src/`. Переезд по этапам плана (2–5) не ломает работающий preview: происходит отдельными шагами с обновлением vite/docker/CI.
- **.env** — исключены из git на уровне `.gitignore`. На проде значения только в `/etc/growthpeak/<service>.env` (см. `core/rtfm_core_api.md`).

## Стек
- Frontend: React 18, Vite 5, Tailwind, TanStack Query, React Flow, Recharts, framer-motion.
- Backend: Laravel 11, Sanctum, Spatie Permission, Reverb.
- БД: PostgreSQL 14+ (production), MySQL (legacy shared-hosting).
- Кеш / очереди: Redis 7+.
- AI: любой OpenAI-совместимый endpoint (OpenAI / OpenRouter / Azure / self-hosted vLLM / Ollama).
- Почта: Unisender Go API + SMTP fallback.

## Быстрый старт
```bash
# фронт (пока в корне)
bun install && bun run dev

# бэк (пока backend-laravel/)
cd backend-laravel && composer install && php artisan serve
```

## Деплой
См. [`DEPLOYMENT.md`](./DEPLOYMENT.md) и [`docs/ON-PREMISE.md`](./docs/ON-PREMISE.md).

## Секреты и .env
`.env` **не хранится в git**. На проде значения задаются как переменные окружения процесса (`EnvironmentFile=/etc/growthpeak/<service>.env`, права `0600`). Изменение секрета = SSH на сервер → правка → `systemctl restart`. Полный список переменных — в `rtfm_*.md` каждого сервиса.
