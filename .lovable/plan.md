## Проблема
На дашбордах и в аналитике много числовых метрик (например «Средний балл», «Индекс риска», «Вовлечённость», «Комфорт», «Прогресс трека»), но пользователь не понимает: что это, из чего считается, что делать. Нужны единые понятные названия + расшифровки везде, где есть расчёты.

## Решение — единый компонент + справочник метрик

### 1. Справочник метрик (`src/lib/metricsCatalog.ts`)
Единый источник правды. Каждая запись:
```ts
{
  key: "avg_competency_score",
  label: "Средний уровень компетенций",     // человеко-понятное имя
  short: "0–5 по шкале компетенций",         // подпись под числом
  formula: "Σ(оценки по всем компетенциям) / количество компетенций",
  interpretation: "≥ 4 — сильный, 3–3.9 — норма, < 3 — зона роста.",
  action: "Откройте цифровой паспорт → добавьте развивающие цели в IDP.",
  href?: "/digital-passport",
  unit?: "балл" | "%" | "дн." | "чел." | "₽",
  range?: [0, 5],
}
```
Начальный набор (≈20 ключей, покрывающих текущие экраны):
- **HRD Analytics**: risk_index, attrition_forecast, engagement_index, comfort_index, headcount_delta, hiring_funnel_conversion, absence_rate, timeToHire, promotion_rate, avg_tenure.
- **Дашборд сотрудника**: avg_competency_score, idp_completion, track_progress, assessment_freshness, gamification_points.
- **Дашборд руководителя**: team_avg_score, team_risk_share, team_engagement, overdue_tasks.
- **Карьерные треки**: track_completion, step_success_rate, avg_time_per_step.

### 2. Компонент `MetricLabel` (`src/components/metrics/MetricLabel.tsx`)
Универсальная обёртка для заголовка метрики:
- Рендерит новое человеко-понятное `label` + иконку `(i)` (Lucide `Info`).
- По клику/ховеру открывает `Popover` (mobile-friendly, работает с `TooltipProvider` для десктопа как hover, `Popover` — как fallback для touch).
- Содержимое поповера: **Что это** (label + short) → **Как считается** (formula) → **Как читать** (interpretation) → **Что делать** (action + опциональная ссылка).
- Проп `metricKey: keyof typeof metricsCatalog` — всё остальное подтягивается автоматически.
- Плюс вариант `MetricValue` — обёртка над числом: показывает значение крупно + мелкую подпись `short` под ним.

### 3. Компонент `ChartExplainer` (`src/components/metrics/ChartExplainer.tsx`)
Для графиков: карточка-заголовок графика с `MetricLabel` внутри + опциональная строка «На что смотреть»: направление тренда, что означает всплеск/падение. Используется в `HRDDashboard`, `RiskAnalytics`, `PeopleAnalytics`, `PulseSurveys`, `ComfortCompany`, `ComfortEmployee`, `HRDCareerTracksAnalytics`, `UserProductAnalytics`, `Analytics.tsx`, `ProductAnalytics`.

### 4. Внедрение
Прохожу по файлам списком (с рефакторингом, не переписыванием):
- `src/pages/HRDDashboard.tsx` — KPI-карточки и заголовки Recharts обернуть в `MetricLabel`/`ChartExplainer`.
- `src/pages/Dashboard.tsx` (сотрудник) — KPI «Средний балл», «Прогресс трека», «Игровые очки».
- `src/pages/ManagerDashboard.tsx` — KPI команды.
- `src/pages/RiskAnalytics.tsx`, `src/pages/PeopleAnalytics.tsx`, `src/pages/PulseSurveys.tsx`, `src/pages/Analytics.tsx`, `src/pages/ProductAnalytics.tsx`.
- `src/pages/analytics/comfort/ComfortCompany.tsx`, `ComfortEmployee.tsx`.
- `src/components/HRDCareerTracksAnalytics.tsx`, `src/components/HRDEmployeeMap.tsx`, `src/components/UserProductAnalytics.tsx`.
- `src/pages/GamificationManagement.tsx` — «Очки», «Уровень».

Переименования (жёсткая замена в этих файлах и в `src/i18n/locales/ru/*.json`, `src/i18n/locales/en/*.json`):
- «Средний балл» → «Средний уровень компетенций (0–5)».
- «Индекс риска» → «Риск оттока (0–100%)».
- «Комфорт» → «Индекс комфорта (0–10)».
- «Вовлечённость» → «Индекс вовлечённости (0–100%)».
- «Прогресс трека» → «Прогресс по карьерному треку, %».
- Аналогично в EN-локали.

### 5. i18n
- В `src/i18n/locales/ru/metrics.json` (новый) + `src/i18n/locales/en/metrics.json` — переводы `label/short/formula/interpretation/action` по каждому `metricKey`. `metricsCatalog.ts` возвращает не строки, а i18n-ключи; сам компонент использует `useTranslation("metrics")`.
- Регистрирую namespace `metrics` в `src/i18n/index.ts`.

### 6. Что явно НЕ делаю
- Не трогаю бэкенд, формулы остаются как есть — только описываю их.
- Не переверстываю страницы, только заменяю заголовки/подписи метрик и оборачиваю в новый компонент.

## Результат
- Единый Popover с (i) на каждой метрике: определение → формула → трактовка → действие.
- Постоянная подпись-контекст под каждым числом (например «0–5 по шкале компетенций»).
- Понятные названия вместо «Средний балл».
- Один справочник — легко расширять и переводить.
