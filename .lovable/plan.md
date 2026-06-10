# Внутренняя продуктовая аналитика

Цель — собрать собственный аналог Mixpanel/Amplitude/Grafana внутри Growth Peak: фиксировать события, сессии, ошибки и строить отчёты по путям, функционалу и проблемам. Никаких внешних сервисов (GDPR/контур заказчика).

## 1. Что собираем (схема событий)

Единая таблица `analytics_events` на Laravel-бэке:

```text
id, occurred_at, received_at,
session_id (uuid с фронта), user_id (nullable), company_id (nullable),
role (employee/manager/hrd/...), impersonated_by (nullable),
event_type:   page_view | action | api_call | api_error | js_error | session_start | session_end | perf
event_name:   "career_track.step.submit", "shop.checkout.click", ...
route, path, referrer,
component (опц.), target (опц.),
duration_ms (опц.), status_code (опц.),
properties jsonb, ua, ip_hash, app_version, locale
```

Дополнительно:
- `analytics_sessions` — id, user_id, started_at, ended_at, last_seen_at, pages_count, errors_count, ended_reason (`idle|navigation|crash|logout`), entry_route, exit_route, device, viewport.
- `analytics_user_groups` — пользовательские сегменты (HRD сам задаёт признак группировки: role / department / company / position / custom tag).

Индексы по `(company_id, occurred_at)`, `(session_id)`, `(event_name, occurred_at)`, GIN по `properties`.

## 2. Сбор данных

### Фронт (React)
- `src/lib/analytics/tracker.ts` — singleton:
  - инициирует `session_id` (sessionStorage, TTL 30 мин неактивности),
  - буферит события и шлёт батчем (`navigator.sendBeacon` на unload, иначе fetch каждые 5 c / 20 событий),
  - автотрекинг: `page_view` через React Router, клики по `[data-track]`, отправка форм, время на странице,
  - перехват ошибок: `window.onerror`, `unhandledrejection`, React `ErrorBoundary` (см. `AppLayout`),
  - перехват `fetch`/`axios` для `api_call`/`api_error` (статус, длительность, route),
  - perf: LCP/CLS/INP через `web-vitals` (раз за сессию).
- Хелпер `track(name, props?)` для ручных событий в ключевых местах (HRDEmployeeMap, Assessment, CareerTrack submit, Shop checkout, Support создание тикета и т.п.).
- Уважение настройки приватности: если `profile.analytics_opt_out=true` — шлём только агрегированные счётчики без `properties`.

### Бэк (Laravel)
- `POST /api/analytics/ingest` — принимает батч, валидирует, ставит в очередь (`AnalyticsIngestJob`), пишет в `analytics_events` пачкой. Rate-limit per session.
- Middleware `TrackApiCall` пишет `api_call`/`api_error` для всех `/api/*` (route, status, ms, user_id, company_id).
- Команда `analytics:rollup` (Scheduler, каждые 5 мин) считает агрегаты в `analytics_daily_*` (события/день, воронки, top routes, error-rate) — для быстрых дашбордов.
- Ретеншн: команда `analytics:prune` удаляет сырые события старше N дней (по умолчанию 180), агрегаты хранятся бессрочно.

## 3. Админ-дашборд `/admin/analytics`

Доступ: `superadmin` (глобально) и `company_admin`/`hrd` (только своя `company_id`). RLS-эквивалент в Laravel-политике `AnalyticsPolicy`.

Разделы (вкладки, всё локализовано RU/EN):

1. **Обзор** — DAU/WAU/MAU, средняя длина сессии, % сессий с ошибкой, топ-5 экранов, топ-5 действий. Фильтры: период, компания, роль, сегмент.
2. **Пути пользователей**
   - Sankey-диаграмма переходов между экранами (Recharts + `@nivo/sankey` или собственный SVG).
   - Переключатель: **по группе** (группировка по любому полю — role, department, company, custom segment из `analytics_user_groups`) / **по конкретному пользователю** (поиск по ФИО/email, таймлайн всех событий сессии).
3. **Функционал**
   - Таблица `event_name` × количество × уникальные пользователи × % от MAU.
   - Воронки-конструктор: HRD выбирает 2–5 событий, видит конверсию шаг-за-шагом и среднее время.
   - «Реальные задачи»: топ последовательностей из 3 событий (n-grams), помогает увидеть какие сценарии действительно проходят.
4. **Проблемы**
   - **Дропы сессий** — экраны/действия, после которых сессия чаще всего обрывается (exit-rate, rage-clicks: ≥3 клика по одному селектору за 2 c).
   - **Неработающий функционал**:
     - JS-ошибки сгруппированы по `message + component` со счётчиком, последним стеком, затронутыми пользователями, ссылкой на сессии.
     - API-ошибки: route × статус × количество × % от вызовов.
     - «Незавершённые операции» — настраиваемые пары `started → completed` (например, `assessment.started` без `assessment.completed` в той же сессии); показываем долю и срез по экранам/ролям.
   - Кнопка «Открыть сессию» → плеер таймлайна событий пользователя (без rrweb — текстовый таймлайн route+action+error с относительным временем).

## 4. Сегменты (группировка по признаку HRD)

UI «Сегменты»: HRD создаёт сегмент правилом (`role = manager AND department = Продажи AND last_session > 7d ago`). Сохраняется в `analytics_user_groups.rules` (jsonb). Любой отчёт можно отфильтровать по сегменту.

## 5. Приватность и безопасность

- IP только в виде `sha256(ip + daily_salt)`.
- `properties` запрещают PII по белому списку ключей; payload-санитайзер на бэке.
- Настройка компании `analytics_enabled` (по умолчанию on) и пользовательский opt-out в Settings.
- Все ответы ingest — 204, никакой утечки данных наружу.

## 6. Этапы внедрения

1. Миграции (`analytics_events`, `analytics_sessions`, `analytics_user_groups`, агрегаты) + политики.
2. Laravel: `AnalyticsController@ingest`, `TrackApiCall` middleware, jobs, scheduler, rollup, prune.
3. Фронт-трекер + ErrorBoundary + автотрекинг роутов и `[data-track]` + web-vitals.
4. Ручные `track()` в ключевых флоу (онбординг, ассессмент, карьерный трек, магазин, саппорт).
5. Страница `/admin/analytics` с 4 вкладками + конструктор воронок + сегменты.
6. Локализация RU/EN, доступ по ролям, ретеншн и opt-out, доки в `backend-laravel/app/README-*`.

## Открытые вопросы

1. Срок хранения сырых событий — 180 дней ок или нужно больше/меньше?
2. Нужен ли полноценный session-replay (rrweb, тяжело и приватно-чувствительно) или достаточно текстового таймлайна событий?
3. Делать ли воронки/сегменты доступными HRD компании, или только Superadmin на старте (быстрее запустим)?
