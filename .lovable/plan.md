## Аудит текущего состояния

Прошёл по коду по каждому пункту из списка. Что есть, что не работает, что отсутствует:

| # | Обещание | Статус | Что в коде |
|---|---|---|---|
| 1.1 | Экономия на найме/онбординге/обучении: материалы в одном месте + авто-раздача по позиции | ⚠️ Частично | Есть `University`/`courses`/`enrollments`, но у курса **нет привязки к `position_id`**, и нет авто-зачисления сотрудника на курсы своей должности |
| 1.2 | Лояльность авто-настраивается из результатов входящего психо-тестирования | ❌ Нет | Есть `employee_questionnaires` и `gamification_reward_types`, но между ними **нет ни одной связи** — лояльность только ручная |
| 1.3 | Кадровый резерв вместо найма — карьерный трек | ✅ Есть | `career_track_templates`, `employee_career_assignments`, шаги, сдачи — рабочее |
| 1.4 | Предиктивная аналитика + своевременные алерты (отток / атмосфера) | ⚠️ Каркас | Таблица `employee_risk_scores` и страница `RiskAnalytics` есть, но **нет сервиса расчёта** (нет команды/джобы/AI-сервиса) и **нет уведомлений** руководителю/HRD при `risk_level=high` |
| 2.1 | Автоматизация программ лояльности | ⚠️ Частично | `gamification_reward_types.trigger_mode=auto` и `trigger_events` существуют, но **обработчика событий нет** — поля декоративные |
| 2.2 | Все ресурсы в одном месте | ✅ Есть | University, RAG-документы, HR-документы, политики |
| 2.3 | Гибкая аналитика по сотрудникам | ✅ Есть | HRDDashboard, ProductAnalytics, RiskAnalytics, Recharts |

Дополнительно сломано (наследие предыдущих правок): в `HrAnalyticsAiService.php` JSON-схема содержит мусорный ключ `"nations"`/`"n_notes"` вместо `recommendations`/`risk_notes`, и в `CompanyOnboardingSettings` модели/миграции имена булевых полей затёрты до `n` — это ломает `auto_assign_tracks`/`auto_assign_tests`.

## План доводки до соответствия обещаниям

### Шаг 0. Починить регрессии (блокер)
- `backend-laravel/app/Models/CompanyOnboardingSettings.php` — вернуть имена `auto_assign_tracks`, `auto_assign_tests` в `$fillable` и `$casts`.
- `database/migrations/0002_00_13_*` — заменить два поля `n` на правильные имена (новая миграция, не редактируем существующую — добавим `0003_00_*_fix_onboarding_settings_columns.php` с `renameColumn`).
- `HrAnalyticsAiService.php` — восстановить ключи `recommendations` и `risk_notes` в обоих местах.

### Шаг 1. Материалы авто-раздаются по позиции
- Миграция: `courses.position_ids json nullable` (массив должностей, для которых курс обязателен) + индекс.
- `EnrollmentController@autoEnrollByPosition($userId)` — при назначении/смене `profiles.position_id` создаёт `enrollments` по всем курсам, чьи `position_ids` содержат должность.
- Хук в `ProfileController::update` и в приём приглашения (`EmployeeInvitationController`) → дёргает авто-зачисление.
- UI: в `CourseAuthoring.tsx` мульти-селект «Обязателен для должностей».

### Шаг 2. Лояльность из психо-профиля
- Миграция: `gamification_reward_types.psych_traits json nullable` (например `{"trait":"achievement","min_level":3}`).
- Сервис `LoyaltyProfileService::applyForUser($userId)` — после `employee_questionnaires.status='confirmed'` подбирает и активирует для сотрудника только те награды, чьи `psych_traits` совпадают с его `ai_interpretation.strengths`.
- Хук в `EmployeeQuestionnaireController` на подтверждение.
- UI: в `GamificationManagement.tsx` — поле «Триггер по психо-профилю».

### Шаг 3. Предиктивные алерты
- Сервис `RiskComputationService` — раз в сутки командой `php artisan risks:compute` (Console\Kernel schedule):
  - входы: активность в трекере, незакрытые 1:1, падение `engagement_score`, отрицательные `peer_recognitions`, простой по карьерному треку;
  - выход: апдейт `employee_risk_scores` + AI-recommendations через `HrAnalyticsAiService`.
- При `risk_level` перешёл в `high` → `NotificationService::push()` менеджеру (`team_members`) и HRD компании, тип `risk_alert`.
- UI: на `RiskAnalytics` кнопка «Пересчитать сейчас» (POST `/risks/recompute`), на `HRDDashboard` виджет «Свежие алерты».

### Шаг 4. Автотриггеры программы лояльности
- Сервис `RewardTriggerService::handle(event, payload)` — слушает события: `track.step.approved`, `task.completed`, `course.completed`, `recognition.received`, `tenure.month`.
- Подписать listener в `EventServiceProvider`; точки вызова — соответствующие контроллеры.
- Для каждой `gamification_reward_types` с `trigger_mode='auto'` проверяет `trigger_events` и начисляет `employee_rewards` + `currency_transactions`.

### Шаг 5. Тесты и сверка
- Feature-тесты: `AutoEnrollByPositionTest`, `LoyaltyFromPsychTest`, `RiskComputationTest`, `RewardTriggerTest`.
- Прогнать `php artisan test` + сгенерированные миграции на сэндбоксе.

### Технические детали
- Все новые таблицы/колонки — отдельными миграциями `0003_00_*`, без правки старых.
- На все новые `public` колонки/таблицы — `GRANT` для `authenticated`/`service_role`.
- Локализация ошибок — русский (как в проектной памяти).
- Politики: `OwnedRecordPolicy` для новых сущностей, scope по `company_id`.

После реализации все 6 обещаний из списка будут подтверждены работающим кодом.
