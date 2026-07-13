# План: наведение порядка в файловой структуре

Проект перестраивается в мультисервисный монорепозиторий: ядро API отдельно, микросервисы отдельно, фронтенд отдельно, у каждого — свой `rtfm_*.md`. `.env` уходит из git; на проде — только серверные переменные окружения.

## 1. Новая структура репозитория

```text
/
├─ core/                         # корневой API (бывший backend-laravel)
│  ├─ app/  bootstrap/  config/  database/  routes/  resources/  tests/
│  ├─ .env.example
│  └─ rtfm_core_api.md
│
├─ services/                     # микросервисы
│  ├─ ai/                        # AI Gateway + драйверы + RAG + чат-оценка
│  │  ├─ src/  (Laravel-модуль или отдельное Node/Python-приложение — см. ниже)
│  │  ├─ .env.example
│  │  └─ rtfm_ai.md
│  ├─ chat/                      # мессенджер + Reverb (WebSocket)
│  │  ├─ .env.example
│  │  └─ rtfm_chat.md
│  ├─ analytics/                 # People Analytics, риски, comfort, initiatives
│  │  └─ rtfm_analytics.md
│  ├─ automation/                # AutomationService, RiskComputationService
│  │  └─ rtfm_automation.md
│  ├─ notifications/             # e-mail (Unisender Go), webhooks, iCal
│  │  └─ rtfm_notifications.md
│  ├─ gamification/              # магазин наград, currency, levels
│  │  └─ rtfm_gamification.md
│  └─ ingest/                    # парсинг документов, оргструктуры, geoip
│     └─ rtfm_ingest.md
│
├─ apps/
│  └─ web/                       # SPA (бывший src/, index.html, vite.config.ts)
│     ├─ src/  public/
│     ├─ .env.example
│     └─ rtfm_web.md
│
├─ deploy/                       # nginx, docker-compose, systemd, скрипты
├─ docs/                         # общая архитектурная документация
├─ scripts/                      # backup / restore / promote
└─ README.md                     # верхнеуровневая карта репо со ссылками на все rtfm_*
```

### Что означает «микросервис» на этом шаге

физическое разделение каждого сервиса в отдельные блоки, которые могут поддерживаться отдельно не аффектя весь продукт целиком.  
 первично можно разделить микросервисы по крупным блокам исходя из логики папок, но в идеале добиться полноценной микросервисной архитектуры, где каждый логический блок - отдельный микросервис а апи подразумевает развитие продукта через добавление нового микросервиса который оранично вписывается в общий продукт через апи

## 3. Формат каждого `rtfm_*.md`

Единый шаблон (обязательные разделы):

1. **Назначение** — 3–5 строк о зоне ответственности.
2. **Переменные окружения** — таблица `KEY | обязательна? | описание | пример | где используется`.
3. **Инфопотоки внутри сервиса** — ASCII-схема: входящие эндпоинты → сервисы → БД/очередь/внешние API.
4. **Связь с ядром** — какие эндпоинты core вызывает, какие эндпоинты этого сервиса вызывает core, общие таблицы БД, общие очереди, общие events.
5. **Публичные эндпоинты** — список `METHOD /path` с кратким описанием и требуемыми ролями.
6. **Запуск локально** — `composer install` / `bun install` / `php artisan serve` / `bun dev`, порт.
7. **Тесты** — что покрыто, как запускать.

Для `rtfm_core_api.md` дополнительно:

- **Все методы API** — сгруппированы по доменам, автогенерируемый список из `routes/api.php` + краткие описания.
- **Все инфопотоки** — общая схема «SPA → core → services → БД/Redis/внешние».
- **Roadmap эндпоинтов** — раздел «Планируемые, ещё не реализованные»: подключение новых LLM-провайдеров, новые вебхуки, экспорт данных, SSO SAML, и т.п. Каждый пункт — с кратким обоснованием и предполагаемым интерфейсом.

Название файлов везде — строго `rtfm_<service>.md` (`rtfm_core_api.md`, `rtfm_ai.md`, `rtfm_chat.md`, `rtfm_analytics.md`, `rtfm_automation.md`, `rtfm_notifications.md`, `rtfm_gamification.md`, `rtfm_ingest.md`, `rtfm_web.md`).

## 4. Работа с `.env` (компромиссный вариант)

Требования на выходе:

- в git нет ни одного `.env` — только `*.env.example` в каждом сервисе;
- на проде значения хранятся исключительно как переменные окружения процесса (systemd `Environment=`, docker `env_file` вне репо, либо секреты хостера); их правка требует прямого доступа к серверу;
- локально dev может использовать личный `.env`, но он игнорируется git и не влияет на прод.

Шаги:

1. Добавить в корневой `.gitignore` и `core/.gitignore` строгие правила: `**/.env`, `!**/.env.example`, `!**/.env.sandstorm.example`, `!**/.env.production.example`.
2. Удалить из индекса git текущие `/.env`, `backend-laravel/.env` (файлы физически остаются локально у разработчика).
3. Для каждого сервиса создать `*.env.example` с полным списком переменных и комментариями (единственный источник правды по именам переменных).
4. В `rtfm_*.md` каждого сервиса раздел «Переменные окружения» — единственное место, где перечислены переменные с описанием и обязательностью.
5. В `deploy/` — шаблоны systemd/compose, которые читают переменные из среды сервера (`EnvironmentFile=/etc/careertrack/core.env`, права `0600`, вне git).
6. Проверить, что Laravel и Vite корректно работают, когда `.env` физически отсутствует, а переменные проброшены как env vars процесса (`Config::get`, `import.meta.env` во время build). При необходимости — минимальный патч в `bootstrap/app.php` / `RuntimeEnv.php` для явного fallback на `getenv()`.
7. В `docs/ON-PREMISE.md` и `DEPLOYMENT.md` заменить примеры «положите `.env`» на «пропишите переменные в EnvironmentFile сервера».
8. Инструкция «как поменять секрет на проде» → отдельный раздел в `rtfm_core_api.md`: SSH → правка `/etc/careertrack/*.env` → `systemctl restart`.

Ротацию/хранение чувствительных значений (Google OAuth secret, SMTP-пароли, Unisender API key, AI API key, DB creds) — перенести с текущих значений в git в защищённый файл на сервере; после переноса — считать текущие значения скомпрометированными и **проротировать** (Google, Unisender, SMTP, APP_KEY).

## 5. Порядок работ (этапы)

1. **Каркас.** ✅ Созданы `core/`, `services/*/`, `apps/web/` с `rtfm_*.md` и `.env.example` по шаблону. Корневой `README.md` обновлён как карта репо.
2. **Стратегия расположения кода.** ✅ Принято ADR-001 (`docs/ADR-001-frontend-lives-in-root.md`): фронт остаётся в корне репо, ядро — в `backend-laravel/`. Папки `apps/web/` и `core/` — документационные указатели, чтобы не ломать Lovable-пайплайн авто-деплоя и продовый `deploy/deploy-laravel.sh`. Физический переезд — только при переходе на монорепо-режим Lovable или отказе от Lovable-редактирования.
3. **Разрезание на domain-модули (внутри `backend-laravel/`).** Разложить контроллеры/сервисы по подпапкам `Http/Controllers/Api/<Domain>/` и `Services/<Domain>/`, разнести маршруты по `routes/api/<domain>.php` с `Route::group`. Namespace — `App\Domain\Ai`, `App\Domain\Chat`, и т.д. Изоляция в коде, единый деплой.
4. **Постепенное наполнение `services/<name>/`.** Для каждого домена: скопировать/перенести соответствующие подпапки в `services/<name>/src/` как самостоятельный Laravel-модуль (composer package, PSR-4). Core регистрирует их через provider-ы. Заполнять `rtfm_<name>.md` по мере переноса.
5. **`.env` → env vars.** Реализовать пункт 4: `.gitignore`, `.env.example`, чистка индекса, шаблоны systemd/compose, ротация секретов, обновление документации.
6. **Проверки.** Прогнать `composer test`, `bun test`, `bunx tsgo --noEmit`, `bun run build`, smoke E2E; убедиться, что приложение стартует при пустом `.env` и заданных env-vars.

## 6. Технические детали (для разработчика)

- Laravel 11 поддерживает модульную структуру через service-provider-ы и autodiscovery в `composer.json`. Каждому `services/<name>/` даём свой `composer.json` с PSR-4 (`"CareerTrack\\Ai\\": "src/"`), подключаем как path-repo в `core/composer.json`. Роуты сервиса регистрируются в его `ServiceProvider::boot()` через `Route::prefix('api')->group(__DIR__.'/../routes/api.php')`.
- `src/integrations/supabase/*` во frontend остаётся автогенерируемым — оно живёт в `apps/web/src/integrations/supabase/` и не редактируется.
- Vite `.env`: `VITE_*` переменные встраиваются на этапе билда. Значит **билд фронтенда должен запускаться на сервере** (либо в CI, куда переменные проброшены секретами) — это отражаем в `rtfm_web.md` и `DEPLOYMENT.md`.
- `docker-compose.yml` перерабатывается: сервисы `core`, `ai`, `chat`, `analytics`, `web`, `postgres`, `redis`, `reverb`. Каждый читает `env_file: /etc/careertrack/<name>.env` вне репо.
- В CI (`.github/workflows/*`) — обновить пути (`working-directory: core`, `working-directory: apps/web` и т.п.).
- Ссылки на память проекта (`.lovable/memory/*`) не трогаем, только обновляем упоминания путей.

## 7. Что НЕ входит в этот план

- Физическое разнесение сервисов по отдельным git-репозиториям (пункт 1 запроса пользователь уточнил как «в отдельных папках» в монорепо). Разделение по разным репо — отдельный этап, когда стабилизируются контракты.
- Переписывание Laravel-модулей на другие языки/рантаймы.
- Изменение бизнес-логики. Только структура, документация и работа с секретами.