# Phase 6 — REST API + Impersonation

## CRUD-контроллеры

Базовый `Api\CrudController` инкапсулирует index/show/store/update/destroy с делегированием в Policy и валидацией.
Наследники задают `$modelClass`, `$rules`, `$with`, опционально переопределяют `applyFilters()` и `updateRules()`.

| Resource (URI)              | Controller                          | Policy             |
|-----------------------------|-------------------------------------|--------------------|
| /api/profiles               | ProfileController                   | ProfilePolicy      |
| /api/departments            | DepartmentController                | CompanyScopedPolicy|
| /api/positions              | PositionController                  | CompanyScopedPolicy|
| /api/position-career-paths  | PositionCareerPathController        | CompanyScopedPolicy|
| /api/hr-documents           | HrDocumentController                | CompanyScopedPolicy|
| /api/career-track-templates | CareerTrackTemplateController       | CompanyScopedPolicy|
| /api/assessment-scenarios   | AssessmentScenarioController        | CompanyScopedPolicy|
| /api/closed-question-tests  | ClosedQuestionTestController        | CompanyScopedPolicy|
| /api/achievements           | AchievementController               | OwnedRecordPolicy  |
| /api/assessments            | AssessmentController                | OwnedRecordPolicy  |
| /api/competencies           | CompetencyController                | OwnedRecordPolicy  |
| /api/career-goals           | CareerGoalController                | OwnedRecordPolicy  |
| /api/notifications          | NotificationController              | OwnedRecordPolicy  |
| /api/support-tickets        | SupportTicketController             | OwnedRecordPolicy  |
| /api/team-members           | TeamMemberController                | TeamMemberPolicy   |

Все resource-маршруты завёрнуты в `auth:sanctum` + `effective.user` + `verified.user` + `has.company`.

## Impersonation (поверх Sanctum)

Заменяет клиентский `ImpersonationContext` (sessionStorage) на серверный поток:

1. `POST /api/impersonation/start { target_user_id, ttl_minutes? }` — только superadmin.
   Возвращает Sanctum-токен с двумя abilities: `impersonate-as:{target}` и `impersonated-by:{actor}`.
2. Фронтенд хранит этот токен и шлёт его в `Authorization: Bearer ...` для всех запросов.
3. Middleware `EffectiveUser` парсит abilities токена и подменяет `auth()->user()` на target.
   Реальный actor доступен в `$request->attributes->get('impersonator')`.
4. `POST /api/impersonation/stop` — отзывает все impersonation-токены актора.

Аудит: каждое start/stop пишется в таблицу `impersonation_audit`
(миграция `0001_01_01_000005_create_impersonation_audit.php`).

Преимущество перед текущей фронтовой реализацией:
- target_user_id зашит в подписанный Sanctum-токен → подделать нельзя;
- TTL ограничен (default 60 мин);
- аудит-лог сохраняет реального инициатора.

## Что НЕ сделано в Фазе 6 (по плану — Фазы 7+)

- Edge Functions → Laravel-сервисы (Gemini AI: assessment-chat, parse-*, generate-*).
- Storage (legacy Storage → S3/MinIO) и контроллеры файлов.
- Realtime (legacy Realtime → Reverb).
- Admin/superadmin endpoints (companies CRUD, demo_requests, currency settings).
- Дочерние сущности (goal_checklist_items, career_level_actions, *_files) — авторизация через родителя.
