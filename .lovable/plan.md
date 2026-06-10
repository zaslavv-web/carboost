# План: отвязка Supabase + подготовка on-premise (вариант А)

Цель — оставить только Laravel + MySQL/Postgres как единственный бэкенд и убрать все артефакты Lovable/Supabase в архивную папку `old/`, чтобы проект разворачивался на любом российском контуре без внешних зависимостей.

## 1. Архивация (перенос в `old/`, без удаления — на случай отката)

Создаётся папка `old/lovable-supabase/` со структурой:

```text
old/lovable-supabase/
├── README.md                      ← описание, что и зачем перенесено
├── src-integrations-supabase/     ← из src/integrations/supabase/
├── supabase/                      ← из ./supabase/ (миграции, functions, config.toml)
└── docs/
    ├── AUTH_DOMAIN_SETUP.md       ← если содержит lovable-специфику
    └── notes.md
```

Файлы, которые **переносятся целиком**:
- `src/integrations/supabase/` (client.ts, types.ts) — фронтенд их не импортирует (0 ссылок).
- `supabase/` — миграции и edge-functions Lovable Cloud.

## 2. Чистка кода от упоминаний Lovable

Файлы, которые **редактируются** (lovable-специфику убираем, файл остаётся):

| Файл | Что меняем |
|---|---|
| `package.json` | Удалить зависимость `lovable-tagger` |
| `vite.config.ts` | Удалить блок динамического `import("lovable-tagger")` |
| `src/main.tsx` | Убрать ссылку/коммент на lovable |
| `index.html` | Заменить `og:image`/`twitter:image` с `*.lovable.app` на локальный `/og-cover.png` (положить заглушку в `public/`); проверить `<title>` и meta |
| `.env` / `.env.example` | Удалить `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `playwright.config.ts`, `playwright-fixture.ts` | Убрать baseURL/упоминания `*.lovable.app`, заменить на `http://localhost:8080` |
| `DEPLOYMENT.md` | Переписать под чистый Docker/nginx + Laravel, без упоминаний Lovable |
| `test-sync.md` | Удалить (служебный файл Lovable) или перенести в `old/` |
| `backend-laravel/config/service-infra.php` | Убрать lovable-комментарии/дефолты |
| `backend-laravel/app/Services/AI/AiGatewayService.php` | Заменить термин "Lovable AI Gateway" на нейтральное "AI Gateway"; логика через `AI_API_URL` / `AI_API_KEY` уже портабельная |
| `backend-laravel/app/README-ai.md` | Аналогично — переписать без бренда |
| `tsconfig.node.tsbuildinfo` | Удалить (артефакт сборки, регенерируется) |

## 3. Очистка `.env` и документация on-premise

- Обновить `.env.example` так, чтобы он содержал только нужное:
  ```text
  VITE_LARAVEL_API_URL=/api
  AI_API_URL=...        # любой совместимый Gateway (можно self-hosted)
  AI_API_KEY=...
  ```
- Создать `docs/ON-PREMISE.md` с инструкцией развёртывания:
  1. `docker-compose up -d` (frontend + nginx).
  2. Laravel-бэкенд из `backend-laravel/` (composer install, миграции, php-fpm).
  3. MySQL/Postgres локально.
  4. AI Gateway — указать любой внутренний эндпоинт через `AI_API_URL`.
  Никаких внешних SaaS, никаких иностранных зависимостей в рантайме.

## 4. Удаление мёртвого Lovable Cloud

- В настройках проекта Lovable Cloud будет отключён (это делается вне репозитория — сообщу инструкцию после применения плана).
- В коде после шагов 1–3 не останется ни одного импорта `@/integrations/supabase`.

## 5. Проверка после изменений

- `bun install` (lovable-tagger уйдёт из lock).
- `bun run build` — сборка должна пройти.
- `rg -i lovable src backend-laravel public index.html vite.config.ts` — должно быть пусто (кроме `old/`).
- `rg "integrations/supabase" src` — пусто.
- Smoke: открыть preview, проверить что страницы грузятся, `growth-peak.pro/api` отвечает.

## Что **не** трогаем
- Папку `node_modules` и lock-файлы — переустановятся при `bun install`.
- Логику бизнес-фич и Laravel-контроллеры.
- Дизайн-систему и компоненты UI.

## Открытый вопрос

`docs/AUTH_DOMAIN_SETUP.md` — это инструкция по настройке домена для писем (упоминает Lovable Email). Перенести в `old/` целиком или переписать под отправку через локальный SMTP/Yandex 360? По умолчанию — переношу в `old/`, добавляю короткий `docs/EMAIL_SETUP.md` со ссылкой на стандартную Laravel Mail-конфигурацию (SMTP).
