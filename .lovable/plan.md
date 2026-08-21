# Починка CI: workflow «Tests» падает на setup-node

## Причина

В репозитории нет `package-lock.json` — зависимости зафиксированы в `bun.lock` (проверено: в корне только `bun.lock` и `package.json`). А `.github/workflows/tests.yml` использует `actions/setup-node@v4` с `cache: npm` и `npm ci`, поэтому шаг падает: «Dependencies lock file is not found». Заодно раннеры предупреждают о снятии с поддержки Node 20.

Workflow деплоя (`deploy-frontend.yml`) уже собирается через Bun — CI нужно привести к тому же способу.

## Что меняем

Файл `.github/workflows/tests.yml`, три job'а, использующие Node:

- `frontend`: заменить `actions/setup-node@v4` + `npm ci` на `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`; команды стали `bun run test`, `bunx tsc --noEmit`, `bun run build`.
- `e2e`: то же самое, плюс `bunx playwright install --with-deps chromium` и `bunx playwright test ...`.
- `load`: убрать `cache: npm` (там всё равно нет установки зависимостей) и перевести на Node 24 — скрипт `scripts/loadtest/load-test.mjs` запускается голым `node`.

Job `backend` (PHP) не трогаем.

## Технические детали

- Bun ставим через `oven-sh/setup-bun@v2` с `bun-version: latest` — как в `deploy-frontend.yml`, чтобы CI и деплой собирали одинаково.
- `bun install --frozen-lockfile` требует актуального `bun.lock`; если он разойдётся с `package.json`, шаг упадёт явной ошибкой — это желаемое поведение для CI.
- Для `load` job указываем `node-version: 24` у `actions/setup-node@v4`, без параметра `cache`.
