# Phase 5 — Eloquent models

Все доменные модели лежат в `app/Models/`. Привязка к политикам — в
`app/Providers/AuthServiceProvider.php` (`$policies[]`).

## Группы моделей

### Company-scoped (CompanyScopedPolicy + BelongsToCompany)
`Department`, `Position`, `PositionCareerPath`, `HrDocument`,
`AssessmentScenario`, `CareerTrackTemplate`, `CareerStepScenario`,
`ClosedQuestionTest`, `GamificationRewardType`,
`EmailDomainPositionMapping`, `CompanyCurrencySettings`,
`CompanyOnboardingSettings`, `EmployeeInvitation`, `EmployeeReward`,
`EmployeeRiskScore`.

### Owned (OwnedRecordPolicy + BelongsToCompany)
`Achievement`, `Assessment`, `Competency`, `CareerGoal`, `Notification`,
`SupportTicket`, `EmployeeCareerAssignment`, `EmployeeQuestionnaire`,
`CareerStepSubmission`, `CurrencyBalance`, `CurrencyTransaction`.

### Team (TeamMemberPolicy)
`TeamMember`.

### Profile / Company
`Profile`, `Company`, `User` (поверх view).

### Дочерние (auth через родителя — без своей policy)
`CareerLevelAction` → `CareerTrackTemplate`
`CareerStepSubmissionFile` → `CareerStepSubmission`
`EmployeeQuestionnaireFile` → `EmployeeQuestionnaire`
`GoalChecklistItem` → `CareerGoal`

### Read-only / системные
`CurrencyBalance`, `CurrencyTransaction` — мутации только через сервис
(пересчёт баланса в БД-триггерах). `DemoRequest` — публичная вставка через
сервис, чтение superadmin. `UserRole` — синхронизируется в `AuthUserService`
вместе с Spatie ролями.

## Использование `BelongsToCompany`

Трейт автоматически:
1. фильтрует все запросы по `company_id` текущего пользователя (superadmin — без фильтра);
2. подставляет `company_id = auth()->user()->companyId()` при `creating`.

Если нужен запрос вне компании (миграция, импорт, cross-company отчёт
для superadmin) — снять scope:
```php
Department::withoutGlobalScope(\App\Models\Scopes\CompanyScope::class)->get();
```

## Что не вошло в Фазу 5 (требует контекста БД)

`hr_tasks`, `hr_task_assignees`, `pricing_inquiries`, `shop_products`,
`shop_orders`, `cart_items`, `chat_messages` и прочие — добавим в
Фазу 5b после полного дампа схемы.
