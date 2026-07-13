# rtfm_core_api — Корневой API

> **Статус:** документационный указатель. Код физически живёт в `/backend-laravel/` и **останется там**. Причины и условия возможного будущего переименования — см. `docs/ADR-001-frontend-lives-in-root.md`.
>
> Кратко: продовый деплой (`deploy/deploy-laravel.sh`), `docker-compose*.yml` и GitHub Actions жёстко ссылаются на путь `backend-laravel/`. Одномоментное переименование = риск положить прод. Логический контракт API (эндпоинты, домены, секреты, инфопотоки, roadmap) описывается здесь и является источником правды; папка `backend-laravel/` — реализация.
>
> **Как работать:**
> - редактировать код API — в `/backend-laravel/`;
> - редактировать контракт/документацию/список секретов — в этом файле и `core/.env.example`;
> - при добавлении нового эндпоинта: сначала фиксируем в разделе 6 (Roadmap) этого файла, затем реализуем.

## 1. Назначение
Ядро мультитенантной HR-tech платформы Growth Peak: аутентификация, роли/RLS, домены Career/Assessment/Leaves/Support, реестр компаний и должностей, оркестрация вызовов к сервисам (`services/ai`, `services/chat`, `services/analytics`, `services/automation`, `services/notifications`, `services/gamification`, `services/ingest`).

## 2. Переменные окружения

Полный список — см. `core/.env.example`. Ключевые группы:

| Группа | KEY | Обязат. | Описание |
|---|---|---|---|
| App | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_URL`, `APP_DEBUG`, `APP_LOCALE`, `APP_TIMEZONE` | да | Стандарт Laravel |
| DB  | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | да | PostgreSQL 14+ |
| Cache/Queue/Session | `CACHE_STORE`, `QUEUE_CONNECTION`, `SESSION_DRIVER`, `REDIS_HOST/PORT/PASSWORD/CLIENT` | да | Redis рекомендуется |
| Sanctum | `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN` | да | SPA-домены |
| OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | опц. | Google Sign-In |
| Frontend | `FRONTEND_URL` | да | Для редиректов после OAuth и в письмах |

**Правило:** `.env` **отсутствует** в git. Значения на проде — только в `EnvironmentFile=/etc/growthpeak/core.env` (права `0600`, владелец www-data). Изменение секрета = SSH → правка файла → `systemctl restart growthpeak-core`.

## 3. Инфопотоки (общая схема)

```text
SPA ──HTTPS──► nginx ──/api/*──► core (php-fpm)
                                      │
       ┌──────────────────────────────┼─────────────────────────────┐
       ▼                              ▼                             ▼
   PG (Postgres)                Redis (cache/queue/session)    services/*
       │                              │                             │
       │                              └─► queue workers ─┐          │
       │                                                 ▼          │
       └──────────────────────────────────────────► domain events ──┘
                                                        │
                                                        ▼
                                             services/notifications
                                             (mail/webhook/ical)
```

## 4. Полный список эндпоинтов

Источник правды — `core/routes/api.php`. Ниже — сводка по доменам. Сгенерируется автоматически из роутов на stage 3 (`php artisan route:list --json` → скрипт → этот раздел).

### 4.1 Auth
- `POST /api/auth/register` — регистрация (throttle 10/min)
- `POST /api/auth/login` — логин (throttle 10/min)
- `POST /api/auth/forgot-password` — запрос reset
- `POST /api/auth/reset-password` — установка нового пароля
- `GET  /api/auth/me` — текущий пользователь
- `POST /api/auth/logout` — выход
- `GET  /api/auth/google/redirect|callback` — Google OAuth
- `GET  /api/auth/yandex/redirect|callback` — Yandex OAuth
- `GET  /api/geo` — GeoIP + доступные способы входа

### 4.2 Profile, Company, Org
- `GET|PATCH /api/profile`
- `GET|POST|PATCH|DELETE /api/companies/*`
- `GET|POST|PATCH|DELETE /api/departments/*`
- `GET|POST|PATCH|DELETE /api/positions/*`
- `GET|POST|PATCH|DELETE /api/position-career-paths/*`
- `GET|POST|PATCH|DELETE /api/team-members/*`
- `POST /api/impersonation/{start,stop}` (Superadmin)

### 4.3 Career & Assessment
- `GET|POST|PATCH|DELETE /api/career-track-templates/*`
- `GET|POST|PATCH|DELETE /api/career-goals/*`
- `GET|POST|PATCH|DELETE /api/goal-checklist-items/*`
- `GET|POST|PATCH|DELETE /api/competencies/*`
- `GET|POST|PATCH|DELETE /api/assessments/*`
- `GET|POST|PATCH|DELETE /api/assessment-scenarios/*`
- `GET|POST|PATCH|DELETE /api/closed-question-tests/*`

### 4.4 Leaves & Performance & Discipline
- `GET|POST|PATCH|DELETE /api/leave-{types,requests,balances,compensations}/*`
- `GET|POST|PATCH|DELETE /api/performance/*`
- `GET|POST|PATCH|DELETE /api/one-on-ones/*`
- `GET|POST|PATCH|DELETE /api/probations/*`
- `GET|POST|PATCH|DELETE /api/disciplinary/*`

### 4.5 Support & HR Docs
- `GET|POST|PATCH|DELETE /api/support-tickets/*`
- `GET|POST|PATCH|DELETE /api/hr-documents/*`

### 4.6 Проксирование к сервисам (внешние контракты)
- `/api/ai/*` → **services/ai** (см. `services/ai/rtfm_ai.md`)
- `/api/rag/*` → **services/ai**
- `/api/chat/*` + WS → **services/chat**
- `/api/analytics/*`, `/api/people-analytics/*`, `/api/comfort/*`, `/api/risks/*`, `/api/initiatives/*` → **services/analytics**
- `/api/automation/*` → **services/automation**
- `/api/notifications/*`, `/api/webhooks/*`, `/api/ical/*` → **services/notifications**
- `/api/gamification/*`, `/api/achievements/*`, `/api/peer-recognition/*` → **services/gamification**
- `/api/storage/*`, `/api/org-structure/import` → **services/ingest**

### 4.7 Служебные
- `GET /api/health` — health-check (db + опц. redis)
- `POST /api/db`, `POST /api/rpc` — типизированный универсальный CRUD/RPC-шлюз (использует SPA через `laravelDb`/`laravelRpc`)

## 5. Roadmap эндпоинтов (планируемые, не реализованы)

| Endpoint | Обоснование | Предполагаемый интерфейс | Куда пойдёт |
|---|---|---|---|
| `POST /api/ai/providers` | Подключение новой LLM (Yandex GPT, GigaChat, DeepSeek, Anthropic) без правки кода | `{ id, driver, base_url, api_key_secret_ref, model }` | services/ai |
| `GET /api/ai/providers/{id}/health` | Проверка живости конкретного провайдера | `{ status, latency_ms }` | services/ai |
| `POST /api/sso/saml/metadata` | Enterprise SSO (SAML 2.0) для корпоративных клиентов | стандарт SAML metadata XML | core |
| `POST /api/sso/oidc/register` | OIDC provider registration | OIDC discovery | core |
| `POST /api/export/company` | Полный экспорт данных компании (GDPR/152-ФЗ) | `{ format: 'zip', include: [...] }` → job_id | services/ingest |
| `GET  /api/export/{job_id}` | Статус/скачивание экспорта | streaming | services/ingest |
| `POST /api/webhooks/{id}/test` | Тестовый ping вебхука | `{}` → `{ delivered, status }` | services/notifications |
| `POST /api/ai/embeddings/rebuild` | Пересборка RAG-индекса | `{ scope: 'company'\|'global' }` | services/ai |
| `GET  /api/audit-log` | Единый audit log (кто что сделал) | filter+cursor | core |
| `POST /api/data-residency` | Выбор региона хранения (RU/EU) | `{ region }` | core |
| `POST /api/billing/subscriptions` | Тарификация on-prem | Stripe/ЮKassa-совместимо | новый сервис `services/billing` |

## 6. Ротация и работа с секретами на проде
1. SSH на сервер.
2. `sudo -u root vim /etc/growthpeak/core.env` (или `ai.env`, `chat.env` — соответствующий сервис).
3. `sudo systemctl restart growthpeak-core@php-fpm` (и/или конкретный сервис).
4. Проверить `GET /api/health` и логи `journalctl -u growthpeak-core -n 100`.

## 7. Запуск локально
```bash
cd core   # (в stage 1 — backend-laravel/)
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed
php artisan serve --host=0.0.0.0 --port=8000
php artisan queue:work &
php artisan schedule:work &
```

## 8. Тесты
`composer test` (PHPUnit) — `tests/Feature/*`, `tests/Unit/*`. Матрица покрытия — `tests/README.md`.
