# rtfm_analytics — People Analytics

> Статус: **каркас (stage 1)**.

## 1. Назначение
HRD-аналитика: карты сотрудников, риски, индексы комфорта/выгорания, инициативы, sankey карьерных путей, People Analytics-дашборды. Кликабельные фильтры и агрегаты для Recharts.

## 2. Переменные окружения

| KEY | Обязат. | Описание | Пример | Где |
|---|---|---|---|---|
| `ANALYTICS_CACHE_TTL` | нет | TTL кэша агрегатов, сек | `300` | `PeopleAnalyticsController` |
| `RISK_RECOMPUTE_CRON` | нет | Крон-расписание пересчёта | `0 3 * * *` | `RiskComputationService` |
| `COMFORT_MODEL_WEIGHTS` | нет | JSON весов индексов | `{"tenure":0.3,...}` | `ComfortAnalysisService` |

## 3. Инфопотоки

```text
SPA ──GET /api/analytics/*──► *Controller ──► *Service ──► PG (агрегаты)
                                                   │
                                                   └─► Redis cache (short TTL)
Cron (daily) ──► RiskComputationService ──► employee_risk_scores
Cron (daily) ──► ComfortAnalysisService ──► comfort_indexes
```

## 4. Связь с ядром
- Читает: `users`, `employee_career_assignments`, `assessments`, `leave_requests`, `disciplinary_records`, `career_track_templates`.
- Пишет: `employee_risk_scores`, `comfort_indexes`, `initiatives`.
- События: слушает `AssessmentCompleted`, `CareerStepSubmitted` для инвалидации кэша.

## 5. Публичные эндпоинты
| Метод | Путь | Роли | Описание |
|---|---|---|---|
| GET | `/api/analytics/overview` | HRD | Верхнеуровневые метрики |
| GET | `/api/analytics/employees-map` | HRD | Карта сотрудников |
| GET | `/api/analytics/paths-sankey` | HRD | Sankey карьерных путей |
| GET | `/api/analytics/risks` | HRD | Список сотрудников с рисками |
| GET | `/api/comfort/index` | HRD | Индексы комфорта |
| GET | `/api/comfort/initiatives` | HRD | Инициативы |
| POST| `/api/comfort/initiatives` | HRD | Создать инициативу |
| GET | `/api/people-analytics/*` | HRD | Wave 6 дашборды |
| GET | `/api/users/{id}/insights` | Manager, HRD | Инсайты сотрудника |

## 6. Запуск локально
Внутри core: обычный `php artisan serve`. Пересчёты — `php artisan schedule:work`.

## 7. Тесты
`core/tests/Feature/RiskComputationTest.php`, `ComfortAnalysisTest.php`.
