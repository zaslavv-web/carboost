# Предиктивный анализ комфорта работы

Расширяем существующий модуль `RiskComputationService` + `RiskAnalytics.tsx`: добавляем два новых направления сигналов (Tone of Voice и Карьерный трек), расширяем KPI-блок и строим дашборд с drill-down **Компания → Отдел → Сотрудник**.

## 1. Модель данных (бэкенд)

Новая миграция `create_comfort_scores_table`:

```text
comfort_scores
  id, company_id, scope ('company'|'department'|'user'),
  scope_id (uuid | null для компании),
  tov_score        (0..100)   — тон коммуникаций
  kpi_score        (0..100)   — исполнительская дисциплина
  career_score     (0..100)   — движение по треку
  comfort_index    (0..100)   — взвешенный интеграл
  risk_level       ('low'|'medium'|'high'|'critical')
  trend            ('up'|'flat'|'down')  — δ к прошлому периоду
  factors          jsonb      — топ-сигналы с весами
  recommendations  jsonb
  period_start, period_end, computed_at, timestamps
  unique(company_id, scope, scope_id, period_start)
```

Плюс `comfort_signal_events` (тонкая таблица для аудита: user_id, signal_type, value, weight, source, occurred_at) — чтобы карточка сотрудника показывала «почему такой скоринг».

Гранты + RLS: чтение только `hrd | company_admin | superadmin` своей компании; менеджер видит только свой отдел/подчинённых (через `team_members`).  
Но есть возможность экспорта в виде отчетов для руководителей (PDF, PPTX)

## 2. Источники сигналов и формулы

Все сигналы уже лежат в БД, новых интеграций не нужно.

### 2.1 Tone of Voice (вес 0.3)

- **Чат** (`chat_messages` + `chat_conversations`, компанейские): длина сообщений, доля восклицаний/капса, доля негативных маркеров (стоп-слова), время отклика, «тишина» участника.
- **Магазин мотиваций** (`shop_orders`, `currency_transactions`, `peer_recognitions`): частота выдачи/получения признаний, использование внутренней валюты, участие в маркетплейсе.
- **AI-классификатор тональности** (опционально, через Lovable AI, батчами по 50 сообщений; при `AI_DISABLED` — только эвристики). Prompt возвращает `{sentiment: -1..1, toxicity: 0..1}`- нет, используй по умолчанию gemini или deepseek с возможностью интеграции пользовательской нейронки

### 2.2 KPI (вес 0.4)

- **Закрываемость задач** (`tasks`): % закрытых в срок / просроченных / переоткрытых за окно 30/90 дней.
- **Посещаемость**: отсутствия (`leaves` + approved days из `PeopleAnalytics`), опоздания если есть, «no-1:1» за 60 дней.
- **Продуктовые инициативы**: **функционала нет** — предлагаю в этом же скоупе добавить лёгкую таблицу `initiatives` (author_id, company_id, title, description, status, votes, created_at) + страница `Initiatives.tsx` (список + кнопка «Предложить»). Сигнал: количество поданных/принятых инициатив за 90 дней. Если пользователь не хочет — берём только tasks + attendance. - тут ок

### 2.3 Карьерный трек (вес 0.3)

- Прогресс по `employee_career_assignments` (доля пройденных шагов / плановая скорость).
- Динамика достижений: `career_step_submissions` за 90 дней vs предыдущие 90.
- Застой (>90 дней без движения) — уже частично есть в `RiskComputationService`.

Итог: `comfort_index = 0.3·ToV + 0.4·KPI + 0.3·Career`. Пороги: ≥75 low, 55–74 medium, 40–54 high, <40 critical.

## 3. Расчёт и агрегация

Новый сервис `ComfortAnalysisService` (рядом с `RiskComputationService`):

- `computeForUser(userId, companyId)` — считает 3 суб-скоринга, пишет `comfort_scores` (scope=user) + `comfort_signal_events`.
- `aggregateForDepartment(deptId)` — среднее по сотрудникам отдела + доля «high/critical» + скоринг руководителя (берётся из его собственной user-строки + агрегатов подчинённых → **риск по руководителю**).
- `aggregateForCompany(companyId)` — среднее по отделам.

Команда `php artisan comfort:compute {--company=}` + шедулер (ежедневно ночью). Ручной триггер — endpoint `POST /api/comfort/recompute` (гейт как в `RiskController`).

Endpoints (`ComfortController`):

- `GET /api/comfort/company` — сводка + топ-риски отделов/руководителей.
- `GET /api/comfort/department/{id}` — карточка отдела + список сотрудников.
- `GET /api/comfort/user/{id}` — карточка сотрудника с факторами и рекомендациями.
- `GET /api/comfort/trends?scope=&id=&range=90d` — временной ряд `comfort_index`.

## 4. Фронтенд — дашборд «Комфорт работы»

Новый пункт в разделе «Аналитика» (рядом с `RiskAnalytics`), доступ HRD/admin/superadmin; менеджеру — свой отдел.

Роутинг:

- `/analytics/comfort` — уровень компании
- `/analytics/comfort/department/:id`
- `/analytics/comfort/user/:id`

Структура компонентов (`src/pages/analytics/comfort/`):

- `ComfortCompany.tsx` — KPI-плитки (общий индекс, ToV, KPI, Career, доля критических), heatmap отделов, топ-5 отделов с ухудшением, топ-5 руководителей в риске, линия тренда 90 дней.
- `ComfortDepartment.tsx` — те же плитки для отдела, таблица сотрудников с сортировкой по индексу, мини-спарклайны, светофор.
- `ComfortEmployee.tsx` — карточка: радар (ToV/KPI/Career), таймлайн `comfort_signal_events`, список факторов и AI-рекомендаций, кнопки «Назначить 1:1», «Открыть в трекере».
- Общие: `ComfortIndexBadge`, `TrendArrow`, `FactorList`, `DrilldownBreadcrumbs`.

Стек — уже используемый: Recharts (Radar, Line, Bar), TanStack Query, брендовые токены (#D5A52A / #1B1D22, Instrument Serif заголовки).

## 5. Приватность и этика

- В UI никогда не показываем содержимое чатов — только агрегаты и метки сигналов.
- AI-классификатор тональности отключается флагом `COMFORT_AI_ENABLED` (совместимо с on-premise без AI).
- Сотрудник видит только свою карточку из «Моего профиля»; коллеги — нет.
- Логируем каждый расчёт, разрешаем HRD скрыть сотрудника из скоринга.

## 6. Этапы

1. Миграции + `ComfortAnalysisService` (без AI-тональности) + артизан-команда.
2. Endpoints + `RiskController`-подобный доступ.
3. UI: компания → отдел → сотрудник, брендовый стиль.
4. AI-классификатор тональности + флаг, batching, кеш.
5. (Опц.) Мини-модуль `Initiatives` для сигнала «продуктовые инициативы».
6. Интеграция в `RiskAnalytics`: линк «Открыть комфорт-дашборд» и переиспользование `employee_risk_scores` как одного из факторов.

## Вопросы перед стартом

1. Добавляем ли модуль **Инициативы сотрудников** (его сейчас нет)? да
2. Включаем ли AI-классификатор тональности по умолчанию (расход кредитов) или только по флагу? писал выше - на старте подключаем или полностью бесплатную (deepseek) или условно бесплатную (gemini) нейронку дальше даем возможность переключиться на что-то другое
3. Показывать ли сотруднику его собственный `comfort_index` в личном кабинете? да