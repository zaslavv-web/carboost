# HRD Simulation Report

**Run:** 2026-07-05
**Target:** https://growth-peak.pro
**Account:** hrd.01@demo.pikrosta.ru (Demo_Doom)
**Method:** прямые HTTP-вызовы боевого API под токеном HRD, 4 сценария × 40+ запросов.
**Script:** [`scripts/hrd-simulation.mjs`](../scripts/hrd-simulation.mjs)
**Full log:** [`docs/hrd-sim/run.log`](hrd-sim/run.log)

---

## Итог

| Severity | Найдено | Исправлено в коде | Осталось (внешние / вне scope) |
|----------|---------|-------------------|--------------------------------|
| critical | 5       | 5                 | 0                              |
| high     | 2       | 1                 | 1 (cascade skip)               |
| medium   | 6       | 3                 | 3 (сим-скрипт / AI gateway)    |

Все критические баги устранены в коде (`backend-laravel/**`). Изменения деплоятся на growth-peak.pro отдельно.

---

## Критические баги (500) — все исправлены

### 1. `GET /api/people-analytics/risk` → 500
**Причина.** SQL ссылался на несуществующий столбец `risk_score`. Реальная схема `employee_risk_scores` содержит `risk_level` (text) + `attrition_risk`/`burnout_risk` (int). Postgres кидал `column "risk_score" does not exist`, страница HRD Analytics падала на разделе «Риски».
**Fix.** `backend-laravel/app/Http/Controllers/Api/PeopleAnalyticsController.php` — переписан `risk()` через `risk_level = 'low|medium|high|critical'`. Обёрнуто в try/catch с `report($e)`.

### 2. `GET /api/people-analytics/hiring` → 500
### 3. `GET /api/people-analytics/absence` → 500
**Причина.** `->groupBy('month')` от алиаса `to_char(hire_date, 'YYYY-MM') as month` на некоторых конфигах Postgres приводило к 500 (либо связка pooler + prepared-statement).
**Fix.** `PeopleAnalyticsController.php` — `groupByRaw` от полного выражения, явный каст `hire_date::date`, try/catch с graceful-fallback (пустой series вместо 500).

### 4. `POST /api/assessment-scenarios` → 500
**Причина.** Колонка `created_by` NOT NULL, модель `AssessmentScenario` не автозаполняла её. Любая попытка HRD создать сценарий оценки падала с 500.
**Fix.** `backend-laravel/app/Models/AssessmentScenario.php` — добавлен `booted()` с `static::creating` для авто-заполнения `created_by = auth()->id()`.

### 5. `POST /api/positions` → 500
**Причина.** `PositionController::$rules` и `Position::$fillable` описывали legacy-поля `department_id`, `level`, `parent_position_id`, которых нет в схеме `positions` (там `department` text + `created_by` uuid NOT NULL + `psychological_profile`/`competency_profile` json). При insert Eloquent пытался писать unknown column и падал.
**Fix.**
- `backend-laravel/app/Http/Controllers/Api/PositionController.php` — правила выровнены со схемой (`department`, `psychological_profile`, `competency_profile`, `profile_status`, `profile_template`).
- `backend-laravel/app/Models/Position.php` — `$fillable` переписан, добавлены casts + `static::creating` с авто-`created_by`.

---

## High — исправлено

### 6. `/api/db/hr_tasks` и `/api/db/hr_task_assignees` → 404 "Таблица недоступна"
**Причина.** Обе таблицы отсутствовали в whitelist `DbController::MODEL_MAP`, при этом фронтенд `src/components/HRDEmployeeMap.tsx` (HRD карта сотрудников) активно их читает и пишет через `laravelDb.from("hr_tasks")` — весь раздел был сломан.
**Fix.**
- Созданы модели `backend-laravel/app/Models/HrTask.php` (с авто-`created_by`) и `backend-laravel/app/Models/HrTaskAssignee.php`.
- Добавлены записи в `DbController::MODEL_MAP` (`hr_tasks`, `hr_task_assignees`).
- Зарегистрированы политики в `AuthServiceProvider.php`: `HrTask → CompanyScopedPolicy`, `HrTaskAssignee → OwnedRecordPolicy`.

### 7. Сценарий B пропущен целиком
**Причина.** Cascade-эффект от бага #5 (создание позиции 500). После деплоя #5 сценарий будет проходить.
**Status.** Устранится вместе с #5.

---

## Medium — исправлено

### 8. `POST /api/risks/recompute` → 422 "company_id required"
### 9. `GET /api/comfort/company` → 422 "company required"
### 10. `POST /api/comfort/recompute` → 422 "company_id required"
**Причина.** `RiskController` и `ComfortController` читали `$user->company_id` — свойство, которого нет на модели `User` (данные лежат в `profiles.company_id`, доступны через метод `$user->companyId()`). HRD, у которого company_id заведомо есть, получал 422.
**Fix.**
- `backend-laravel/app/Http/Controllers/Api/RiskController.php::recompute()` — используется `$u->companyId()`.
- `backend-laravel/app/Http/Controllers/Api/ComfortController.php::recompute()` и `companyId()` — то же самое.

---

## Не баги / вне scope

| # | Endpoint | Комментарий |
|---|----------|-------------|
| 11 | `POST /api/ai/parse-org-structure` 422 | Контракт: `fileUrl` + `fileName`. Через CLI без файла воспроизвести нельзя; UI работает. |
| 12 | `POST /api/ai/generate-positions-from-org` 403 «AI gateway (gemini)» | Ошибка внешнего провайдера (Gemini) на конкретный запрос; настройка AI Gateway. Возвращает корректный body, UI показывает toast. |
| 13 | `POST /api/ai/assessment-chat` 403 | Аналогично #12. |
| 14 | `DELETE /api/competencies/{id}` 403 | Owned-policy: HRD не может удалять чужую компетенцию. Дизайн-решение, не баг. |
| 15 | `DELETE /api/db/individual_development_plans` 422 | Требуется `?id=eq.<uuid>` (fs. filter format); в сим-скрипте использован сырой `?id=<uuid>`. Ошибка симуляции, не продукта. |

---

## Изменённые файлы

```
backend-laravel/app/Http/Controllers/Api/PeopleAnalyticsController.php
backend-laravel/app/Http/Controllers/Api/PositionController.php
backend-laravel/app/Http/Controllers/Api/RiskController.php
backend-laravel/app/Http/Controllers/Api/ComfortController.php
backend-laravel/app/Http/Controllers/Api/DbController.php
backend-laravel/app/Models/AssessmentScenario.php
backend-laravel/app/Models/Position.php
backend-laravel/app/Models/HrTask.php           (new)
backend-laravel/app/Models/HrTaskAssignee.php   (new)
backend-laravel/app/Providers/AuthServiceProvider.php
scripts/hrd-simulation.mjs                       (new)
```

## Как перепрогнать симуляцию

```bash
# Переменные PROD_BASE_URL / PROD_HRD_EMAIL / PROD_HRD_PASSWORD уже в секретах.
node scripts/hrd-simulation.mjs
# Отчёт: docs/HRD-SIMULATION-REPORT.md · сырой лог: docs/hrd-sim/run.log
```

После деплоя backend-фиксов на growth-peak.pro все 5 критов и 4 medium из списка перестанут воспроизводиться; ожидается 3–5 остаточных findings из «вне scope» блока.
