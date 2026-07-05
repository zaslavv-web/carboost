# План: HRD-симуляция на боевом сервере + автофикс

## Цель

Имитировать реальные действия HRD на `growth-peak.pro` под аккаунтом `hrd.01@demo.pikrosta.ru`, зафиксировать все проблемы (backend 4xx/5xx, битые валидации, отсутствующие endpoint'ы, некорректные ответы, UX-проблемы, i18n) и починить их.

## Подход

Действуем через HTTP API боевого сервера (тот же слой, что дёргает фронт). Playwright не используем — проверено, что песочница расходится с продом. Все запросы логируем: URL, статус, тело, время. Скриншоты UI не нужны, но для UX-багов, обнаруженных в реакции API (пустые ответы, странные схемы, отсутствующие поля), делаем повторную проверку через фронт-код (какие поля читает `src/pages/*`, чтобы понять, сломается ли UI).

Тестовая утилита — временный PHP-скрипт `backend-laravel/tools/hrd-simulation.php` (не мигрируется, только для локального прогона логов) + Node-скрипт `scripts/hrd-simulation.mjs` для запуска через curl-подобный клиент. Скрипт **не пушится** после отчёта, а результаты складываются в `docs/HRD-SIMULATION-REPORT.md`.

## Шаги

### 1. Подготовка

- Сохранить креды HRD как runtime-секреты (`PROD_HRD_EMAIL`, `PROD_HRD_PASSWORD`, `PROD_BASE_URL=https://growth-peak.pro`).
- Написать `scripts/hrd-simulation.mjs`:
  - `POST /api/auth/login` → сохранить Bearer.
  - Обёртка `call(method, path, body)` c логированием в `docs/hrd-run.log`.
  - Регистрация каждой аномалии в `findings[]` (severity, endpoint, ожидание vs факт).

### 2. Сценарий A — Оргструктура и должности

- `GET /api/companies/me`, `/api/departments`, `/api/positions`.
- Создать департамент → должность → компетенцию → маппинг email-домена.
- Проверить парсинг оргструктуры (`POST /api/ai/parse-org-structure` или его аналог из `Api/`), загрузив маленький YAML.
- Проверить обновление и удаление, каскад.

### 3. Сценарий B — Карьерные треки

- Создать `career_track_template` (from/to positions), 3 шага `career_step_scenarios`, `career_level_actions`.
- Добавить `position_career_paths` (vertical + lateral).
- Назначить сотрудника (`employee_career_assignments`).
- Прогнать переход шага: `POST /api/career-step-submissions`, `PATCH /.../approve`.
- Проверить, что HRD видит трек в списке и что React Flow-endpoint возвращает граф.

### 4. Сценарий C — Оценка и IDP

- Создать `assessment_scenario`, запустить AI-чат (`POST /api/ai/assessment`), проверить, что ответ сохраняется.
- Создать `individual_development_plan` + `idp_items` (goals, checklist).
- Назначить `hr_task` с assignees, дедлайном, проверить нотификации.

### 5. Сценарий D — Аналитика и риски

- Дёрнуть эндпоинты HRD Analytics: employee map, paths sankey, risk scores, people analytics.
- Прогнать `AutomationService`/`RiskComputationService`-триггеры (если есть API), проверить рассчитанные `employee_risk_scores`.
- Экспорт (xlsx/iCal), webhook dispatcher.

### 6. Отчёт

`docs/HRD-SIMULATION-REPORT.md` со столбцами: сценарий, шаг, endpoint, ожидание, факт, severity, статус (open/fixed), ссылка на коммит фикса.

### 7. Автофикс — всё

Для каждого finding'а:

- **Backend (Laravel)**: править контроллер/валидацию/политику/сервис в `backend-laravel/app/**`, при необходимости — миграция (schema-only) или seed.
- **Frontend (React)**: править страницу/компонент, синхронизировать типы `src/integrations/laravel/*`, добавить локализацию `src/i18n/locales/ru/*`.
- **i18n**: добавить недостающие ключи RU/EN.
После каждого фикса — повторный прогон соответствующего шага; статус в отчёте → `fixed`.

### 8. Финальный прогон

Полная симуляция ещё раз, убедиться, что все `open` → `fixed`. Обновить `docs/HRD-SIMULATION-REPORT.md` итоговой сводкой и добавить запись в `docs/AUDIT-FIX-LOG.md`.

## Технические детали

- Секреты храним через `add_secret`, читаем в скрипте из `process.env`.
- Node-скрипт: `undici`/`fetch` + retry, таймаут 30 с, экспоненциальный бэкофф на 5xx (макс 2 повтора, чтобы отличать флаки от багов).
- Все мутирующие операции создают entity с префиксом `SIM-<timestamp>` в названии, чтобы легко удалить после прогона.
- Для операций, где API отсутствует, но UI ждёт данные — заводим finding severity=high с рекомендацией добавить endpoint.
- Если получаем 401 из-за истечения токена — авто-релогин.

## Ограничения

- Прод-БД не трогаем напрямую; только через API HRD-роли (никаких superadmin-обходов).
- Не удаляем реальные компании/пользователей, работаем строго внутри Demo_Doom.
- Ветку фикса не публикуем до подтверждения — только отчёт + код в проекте.

## Deliverables

1. `scripts/hrd-simulation.mjs` — воспроизводимый прогон.
2. `docs/HRD-SIMULATION-REPORT.md` — все находки + статусы.
3. Коммиты с фиксами по каждому багу.
4. Обновлённая запись в `docs/AUDIT-FIX-LOG.md`.