# Полный аудит кода Growth Peak

**Дата**: 2026-07-01
**Скоуп**: Frontend (`src/**`), Backend Laravel (`backend-laravel/**`), инфраструктура (Docker, nginx, GitHub Actions, deploy/), тесты и документация.
**Фокусы**: Безопасность · Производительность · Архитектура/качество · UX/a11y/i18n

---

## 1. Executive summary

| Категория      | P0 | P1 | P2 | P3 | Итого |
|----------------|----|----|----|----|-------|
| Security       | 0  | 3  | 4  | 2  | 9     |
| Performance    | 0  | 2  | 5  | 3  | 10    |
| Architecture   | 0  | 1  | 6  | 4  | 11    |
| UX / a11y / i18n | 0 | 1  | 4  | 3  | 8     |
| Infra          | 0  | 2  | 2  | 1  | 5     |
| **Всего**      | **0** | **9** | **21** | **13** | **43** |

**Общая оценка**: код в целом здоровый. Критических (P0) находок нет — политики Laravel, multi-tenant изоляция и обработка сессий сделаны правильно. Основные зоны роста: rate-limiting публичных API, HTTP security-headers, размер JS-бандла, покрытие тестами модулей Wave 3–6.

---

## 2. Топ-10 приоритетных проблем

| # | Severity | Категория     | Проблема                                                                 | Файл                                              |
|---|----------|---------------|--------------------------------------------------------------------------|---------------------------------------------------|
| 1 | P1       | Security      | На публичных `/auth/*`, `/rpc/submit_*`, `/analytics/ingest` нет throttle | `backend-laravel/routes/api.php:65-91` **[FIXED]** |
| 2 | P1       | Security      | Отсутствуют HTTP security headers (X-Frame, X-CTO, Referrer-Policy)     | `deploy/nginx.conf` **[FIXED]**                    |
| 3 | P1       | Security      | `/diag` публично раскрывает конфигурацию окружения (mail, google, миграции) | `backend-laravel/routes/api.php:102-146`     |
| 4 | P1       | Performance   | Все страницы в `App.tsx` загружаются синхронно — нет code-splitting для тяжёлых модулей (Analytics, Tracker, ReactFlow) | `src/App.tsx`                                    |
| 5 | P1       | Architecture  | 272 использования `as any` / `@ts-ignore` в `src/**`                    | grep-статистика                                  |
| 6 | P1       | UX/a11y       | `min-h-screen` на 12 top-level страницах — на iOS Safari режется в мобильной высоте | 11 файлов **[FIXED → min-h-dvh]**       |
| 7 | P1       | Infra         | `npm-publish.yml` использует `npm install` без `--frozen-lockfile` — недетерминированные сборки | `.github/workflows/npm-publish.yml`   |
| 8 | P1       | Infra         | Docker-контейнер frontend раздаёт статику под nginx, но CSP не задан    | `deploy/nginx.conf`                              |
| 9 | P2       | Performance   | 15 `console.log/error` в проде — предлагается вынести в централизованный logger с sink в Sentry/OTEL | см. §4.2                                   |
| 10| P2       | Security      | `AnalyticsController::ingest` публичный без верификации origin/CSRF-токена — возможна накрутка событий | `backend-laravel/app/Http/Controllers/Api/AnalyticsController.php` |

---

## 3. Security

### 3.1 Backend

- **[P1] Rate-limit публичных auth-эндпоинтов** — `backend-laravel/routes/api.php:65-77`. Без `throttle` возможен brute-force логина и подбор кодов сброса пароля. **[FIXED]** Обёрнуто в `throttle:10,1` (10 req/min/IP).
- **[P1] `/diag` раскрывает информацию** — `routes/api.php:102`. Ответ содержит версию PHP/Laravel, статус миграций, наличие OAuth-секретов, конфиг SMTP. Хоть значения замаскированы, метаинформация помогает при атаке. **Рекомендация**: закрыть под роль `superadmin` или переменной `APP_DEBUG=true`.
- **[P2] `AnalyticsController::ingest` без throttle и origin-check** — принимает произвольные события с любого IP. **[FIXED throttle]**, но остаётся возможность накрутки; добавить проверку Origin/Referer против списка доменов.
- **[P2] `withoutGlobalScopes` в 10 моделях/сервисах** (`TrackerTask`, `TrackerGoal`, `TrackerComment`, `WebhookDispatcher` и др.) — все использования оправданы (lookup company_id перед автозаполнением), но нет единого документированного правила. **Рекомендация**: добавить в `README-policies.md` секцию «когда допустимо использовать withoutGlobalScopes».
- **[P2] `RagService.php:76` конструирует SQL literal через `DB::raw("'" . $literal . "'::vector")`** — литерал уже валидируется как массив float, но лучше передавать через bindings.
- **[P3] `HrDocument.is_confidential` не влияет на политику чтения** — флаг записывается, но `HrDocumentPolicy` не понижает видимость для non-HRD. Уточнить требования.

### 3.2 Frontend

- **[P2] `dangerouslySetInnerHTML` только в `src/components/ui/chart.tsx:70`** — часть shadcn/ui (инъекция CSS-переменных для recharts), контент не пользовательский. Безопасно.
- **[P2] Токены хранятся в `localStorage`** (`src/lib/authStorage.ts`) — уязвимо к XSS. **Рекомендация**: перейти на httpOnly cookie + Sanctum stateful. Требует ощутимого рефакторинга — P2, а не P1, т.к. XSS-поверхность минимальна.
- **[P3] Нет CSP** — см. §3.3.

### 3.3 Infra

- **[P1] Отсутствуют security headers** — `deploy/nginx.conf`. **[FIXED]**: добавлены `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` во все location-блоки.
- **[P2] Нет `Content-Security-Policy`** — не задан. Из-за динамических Recharts inline-стилей потребует `style-src 'unsafe-inline'` или nonce-based. **Рекомендация**: начать с report-only.
- **[P2] `docker-compose.yml`** запускает сервисы под root по умолчанию — проверить `USER` в Dockerfile.
- **[P3] `.env.example` содержит placeholder-и `changeme` — убедиться, что README запрещает их в проде.**

---

## 4. Performance

### 4.1 Backend

- **[P2] Контроллеры без глобального `$with`**: `LeaveRequestController`, `PerformanceReviewController`, `TrackerTaskController` — риск N+1 при рендере списков. Точечно применяется `->with()`, но не системно. Рекомендация: добавить `$with = ['user:id,full_name', 'company:id,name']` в базовых CRUD.
- **[P2] Индексы**: миграции Wave 5-6 (`0027`, `0028`) создают таблицы `webhook_deliveries`, `hr_documents` — проверить, что есть индексы по `(company_id, created_at DESC)` для типовых выборок.
- **[P2] `PeopleAnalyticsController` считает через 5 отдельных запросов на дашборде** — можно кешировать в Redis на 5 мин.
- **[P3] `HealthController` пингует Redis, даже когда его нет** — уже обработано условием, ок.
- **[P3] `WebhookDispatcher` синхронный (`Http::timeout(5)`)** — доставка блокирует основной запрос. Вынести в очередь `dispatch()`.

### 4.2 Frontend

- **[P1] Нет code-splitting**: `src/App.tsx` импортит все ~60 страниц синхронно. Тяжёлые (`recharts`, `xlsx`, `reactflow`) попадают в главный чанк. **Рекомендация**: перевести маршруты на `React.lazy` + `Suspense`.
- **[P2] `console.log/error` (15 шт.)** — все являются логированием ошибок без PII (проверено), но в проде их лучше отправлять в централизованный sink (`src/lib/analytics/tracker.ts` уже есть).
- **[P2] `xlsx` (~800KB) тянется в `Analytics.tsx`** синхронно — вынести в динамический импорт по клику «Export XLSX».
- **[P2] TanStack Query cache keys** — местами используются массивы с объектами (нестабильные ссылки) → лишние ре-фетчи. Пример: `src/pages/PeopleAnalytics.tsx`.
- **[P3] Отсутствует `React.memo` в тяжёлых списках** (`SkillsMatrix`, `PulseSurveys`).

---

## 5. Architecture & Code Quality

### 5.1 Backend

- **[P1] 272 `as any` / `@ts-ignore` в `src/**`** — по большей части в hooks вокруг Laravel-API. Постепенно вывести в типизированные хелперы `laravelDb<T>()`.
- **[P2] Дублирующиеся паттерны CRUD** — многие контроллеры (Onboarding, IDP, HRDocument) повторяют логику. `CrudController` есть, но не везде наследуется.
- **[P2] Заглушка `src/integrations/supabase/client.ts`** — Proxy бросает при доступе. Хорошо, но остались 32 файла с активными импортами `types.ts` — генерируемый файл больше не соответствует Laravel-схеме, зря вводит в заблуждение.
- **[P2] Legacy `old/lovable-legacy/`** — есть ли ещё активные ссылки? Рекомендация: убрать из `tsconfig` include, если ещё нет.
- **[P3] Много `enum` строк ('active', 'completed'…) захардкожены** — вынести в общие constants.

### 5.2 Frontend

- **[P2] Дублирование дашбордов**: `HRDDashboard` + `Dashboard` + `SuperadminDashboard` — общие карточки метрик можно вынести.
- **[P2] `AppSidebar.tsx` — ~500 строк** — разбить на подкомпоненты (уже начато).
- **[P3] `RoleAwareLayout.tsx` содержит routing-логику** (редиректы `/users`, `/employees`) — вынести в router-config.

---

## 6. UX / a11y / i18n

- **[P1] `min-h-screen` на мобильных экранах** — обрезает контент под UI-баром Safari. **[FIXED]** заменено на `min-h-dvh` в 11 файлах.
- **[P2] Icon-only кнопки без `aria-label`** — точечно встречаются в `AppSidebar`, `TrackerBoard`. Требует ручного прохода.
- **[P2] `h-screen` в `AppSidebar.tsx:480` и `AppLayout.tsx:85`** — fixed-позиционированные панели, менее критично, но тоже стоит перевести на `dvh`.
- **[P2] i18n**: количество ключей ru/en одинаково по каждому namespace — синхронизация ок. Не проверялось значение самих переводов.
- **[P2] Обработка ошибок API централизована в `translateBackendError.ts`** — хорошо, но не везде используется (проверить `pages/Assessment.tsx`, `pages/CareerTracksManagement.tsx`).
- **[P3] Форма демо-запроса на Landing** — нет client-side length limits (пример из best-practices).

---

## 7. Tests & Documentation gaps

- **[P2] Wave 3–6 модули без feature-тестов**: `SkillsMatrix`, `PerformanceReview360`, `PulseSurveys`, `Communities`, `PeopleAnalytics`, `Integrations` — ни одного теста в `backend-laravel/tests/Feature/`.
- **[P2] Frontend-тесты**: только `src/test/product-buttons.smoke.test.tsx` + `LaravelAuthContext.test.tsx`. Нет тестов на `RoleAwareLayout`, `ProtectedRoute`, критичный флоу логина.
- **[P3] `docs/ON-PREMISE.md`** — не обновлён после Wave 6 (нет секций про Webhooks/iCal/People Analytics).
- **[P3] `security-memory`** — не обновлён с закрытием throttle/nginx.

---

## 8. Приложение: команды для воспроизведения аудита

```bash
# Уязвимости зависимостей
npm audit --production

# Опасные фронтенд-паттерны
rg -n "dangerouslySetInnerHTML|eval\(|new Function\(" src/
rg -n 'target="_blank"' src/ | rg -v 'noopener'

# Мобильная высота
rg -n "min-h-screen" src/

# Laravel — global scope bypass
rg -n "withoutGlobalScopes" backend-laravel/app/

# Публичные роуты
rg -n "Route::(get|post)" backend-laravel/routes/api.php | rg -v "auth:sanctum"

# i18n сверка ключей
for lang in ru en; do
  for f in src/i18n/locales/$lang/*.json; do
    echo "$lang $(basename $f): $(jq '[paths(scalars)] | length' $f)"
  done
done
```

---

## 9. Что было исправлено автоматически

См. [`docs/AUDIT-FIX-LOG.md`](./AUDIT-FIX-LOG.md).
