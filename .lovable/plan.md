
# План реализации HR-модулей

Объём большой, делим на **3 итерации**. Каждая = отдельный merge + миграции + UI. Универсальные поля + пресет Кипра для персональных данных. Payslip — загрузка PDF (в эту фазу не входит, идёт во второй итерации профиля).

---

## Итерация 1 — Отсутствия (Отпуска / Больничные / Декрет / Учёба / Отгулы) + Замещения

### Новые таблицы (Laravel-миграции + RLS)

- `leave_types` — справочник типов: `annual`, `sick_paid`, `sick_unpaid`, `maternity`, `study`, `day_off`, `unpaid`. Поля: `company_id`, `code`, `title`, `paid` (bool), `accrual_days_per_year` (numeric), `requires_medical_cert` (bool), `is_active`.
- `leave_balances` — баланс по типу на сотрудника: `user_id`, `company_id`, `leave_type_id`, `accrued_days`, `used_days`, `carryover_days`, `as_of`. Уникальный (user_id, leave_type_id).
- `leave_requests` — заявка: `user_id`, `company_id`, `leave_type_id`, `start_date`, `end_date`, `days_count` (вычисляется без выходных), `reason`, `status` (`pending_manager`, `pending_hr`, `approved`, `rejected`, `cancelled`), `manager_id`, `manager_decision_at`, `manager_comment`, `hr_id`, `hr_decision_at`, `hr_comment`, `substitute_user_id` (nullable), `created_at`.
- `leave_request_files` — медсправки / документы: `request_id`, `file_url`, `file_name`, `uploaded_by`.
- `leave_compensations` — расчёт компенсации при увольнении: `user_id`, `company_id`, `unused_days`, `daily_rate`, `total_amount`, `currency`, `calculated_at`, `paid_at` (nullable).

RLS: сотрудник видит свои заявки/баланс; менеджер — своих подчинённых через `team_members`; HRD/admin — в рамках `company_id`; superadmin — всё.

### Backend (Laravel)

- `LeaveTypeController`, `LeaveBalanceController`, `LeaveRequestController` (CRUD + `approve/reject` actions).
- Сервис `LeaveCalculatorService`:
  - `calculateBusinessDays(start, end)` — рабочие дни без сб/вс.
  - `calculateSickPaidUnpaid(user, days)` — оплачиваемые/неоплачиваемые согласно настройкам компании.
  - `calculateCompensation(user)` — компенсация при увольнении (`unused_days * daily_rate`).
- Двухступенчатое согласование: после `pending_manager → approved by manager → pending_hr → approved by HR → approved`. Каждое решение — уведомление через `notifications`.
- Автоматическое назначение замещающего: если `substitute_user_id` задан и заявка `approved` — создаётся запись в `team_member_substitutions` (доп. таблица: `original_user_id`, `substitute_user_id`, `start_date`, `end_date`, `leave_request_id`) → используется в политиках доступа (заместитель временно видит данные оригинала).

### Frontend

- Страница `/leaves` (новая): таб для сотрудника (мои заявки + баланс + кнопка «Запросить»), таб для менеджера/HRD (входящие на согласование).
- Диалог `LeaveRequestDialog`: выбор типа, дат, причины, выбор замещающего (поиск по сотрудникам команды), загрузка медсправки (для больничных).
- Виджет `LeaveBalanceCard` в `Passport.tsx`: накопленные дни по типам.
- История согласований в карточке заявки (таймлайн).
- Уведомления через существующую систему `notifications`.

### Локализация: ru/leaves.json, en/leaves.json.

---

## Итерация 2 — Performance Management + Испытательный срок + PIP

### Новые таблицы

- `performance_reviews` — оценки: `user_id`, `company_id`, `reviewer_id`, `review_type` (`self`, `manager_30`, `quarterly_90`, `annual_180`, `360`), `period_start`, `period_end`, `status` (`draft`/`submitted`/`acknowledged`), `scores` (jsonb: критерии), `strengths`, `improvements`, `overall_rating` (1-5).
- `performance_review_feedback` — для 360°: `review_id`, `from_user_id`, `feedback`, `is_anonymous`.
- `probation_periods` — испытательный срок: `user_id`, `company_id`, `start_date`, `end_date`, `status` (`active`, `passed`, `extended`, `failed`), `decision_at`, `decision_by`, `decision_notes`, `criteria` (jsonb).
- `disciplinary_records` — взыскания: `user_id`, `company_id`, `kind` (`warning`, `pip`, `observation`), `issued_at`, `issued_by`, `reason`, `status` (`active`, `closed_success`, `closed_failure`), `closes_at`.
- `disciplinary_criteria` — чек-лист выхода из PIP: `record_id`, `criterion`, `is_met`, `met_at`, `met_by`.
- `one_on_one_meetings` — 1:1 календарь: `manager_id`, `employee_id`, `company_id`, `scheduled_at`, `agenda`, `notes`, `status`.

RLS: сотрудник — только свои (и видит только не-анонимный фидбек), менеджер — подчинённых, HRD/admin — компанию.

### Backend

- CRUD-контроллеры на каждую таблицу.
- Cron-команда `RemindProbationDecisions` (артизан-команда + scheduler): за 2–4 недели до `probation.end_date` шлёт уведомление менеджеру и HR.
- Сервис `Performance360Service`: рассылка запросов на фидбек выбранным коллегам, сбор ответов.

### Frontend

- Страница `/performance`: для сотрудника — мои оценки, форма самооценки; для менеджера — список подчинённых с кнопкой «Создать оценку».
- Страница `/probation` (HRD/Manager): таблица сотрудников на исп. сроке с прогресс-баром, форма решения (passed/extended/failed).
- Страница `/disciplinary` (HRD): реестр взысканий, карточка PIP с чек-листом, кнопка закрытия.
- Виджет «Календарь 1:1» — список ближайших встреч.

---

## Итерация 3 — Расширенный профиль + Документы + Полиси + Авто-уведомления + Иммиграция + Внутренние вакансии

### Новые таблицы

- `employee_documents` — все документы: `user_id`, `company_id`, `doc_type` (`passport`, `visa`, `driver_license`, `diploma`, `medical`, `payslip`, `contract`, `other`), `title`, `file_url`, `file_name`, `issued_at`, `expires_at` (nullable), `uploaded_by`, `is_private` (только сотрудник + HR).
- `employee_personal_data` — универсальные идентификаторы: `user_id`, `country_code` (ISO), `data` (jsonb — например `{social_insurance, tic, gesy}` для CY, `{inn, snils}` для RU). Пресет полей по стране в коде frontend.
- `payroll_schedule` — календарь выплат: `company_id`, `period_label`, `pay_date`, `notes`.
- `payslips` — `user_id`, `company_id`, `period_start`, `period_end`, `file_url`, `uploaded_by`, `released_at`. Видны только сотруднику + HR.
- `company_policies` — `company_id`, `title`, `body`, `file_url`, `version`, `published_at`, `requires_ack`.
- `policy_acknowledgements` — `policy_id`, `user_id`, `acknowledged_at`.
- `immigration_records` — `user_id`, `company_id`, `record_type` (`relocation`, `pink_slip`, `yellow_slip`, `work_permit`, `diploma_recognition`), `status`, `started_at`, `expires_at`, `notes`, `documents` (jsonb refs).
- `internal_job_postings` — внутренние вакансии: `company_id`, `position_id` (FK → `positions`), `title`, `description`, `requirements`, `posted_by`, `status` (`open`/`closed`), `closes_at`, `linked_career_track_id` (FK → `career_track_templates`, nullable — связка с треком).
- `internal_job_applications` — `posting_id`, `user_id`, `cover_letter`, `status` (`submitted`, `screening`, `interview`, `accepted`, `rejected`), `created_at`. При связке с треком — автоматически открывает сотруднику соответствующий career track.

### Backend

- CRUD + cron `SendExpiryReminders` (ежедневно): просматривает `employee_documents.expires_at`, `immigration_records.expires_at` — за 30/14/7 дней до истечения шлёт `notifications` сотруднику + HR.
- Cron `SendBirthdayAnniversaryReminders` — за 3 дня и в день: ДР (из `profiles.birth_date`, новое поле) и годовщины (из `profiles.hire_date`).
- Cron `RemindUnusedLeave` (раз в квартал): если `leave_balance.accrued_days - used_days > threshold` — напомнить.

### Frontend

- Страница `/profile/:userId` дополнения: вкладки «Документы», «Персональные данные», «Полиси», «Иммиграция», «Payslips», «Внутренние вакансии».
- Загрузка PDF payslip — HR-only форма; сотрудник видит карточки «Расчётный лист за <период>» со ссылкой на PDF.
- Страница `/policies`: список с кнопкой «Ознакомлен» (создаёт `policy_acknowledgements`).
- Страница `/internal-jobs`: лента вакансий с фильтрами; кнопка «Подать заявку»; HR-вкладка для управления и просмотра кандидатов; связка вакансии с career_track при создании.
- Виджет «Скоро истекает» в дашборде сотрудника и HRD.
- Пресет полей CY (Social Insurance, TIC, GeSy) и RU (ИНН, СНИЛС) — JSON-схема в frontend, поле `data` хранит значения.

---

## Технические детали

- Все таблицы через Laravel-миграции (`backend-laravel/database/migrations/0003_*`), не редактируем существующие.
- Backend следует существующим паттернам: `CrudController`, `BasePolicy`, `EnsureHasCompany`, `EnsureVerified`.
- Frontend через `laravel.get/post/patch/delete` (`@/integrations/laravel/client`), TanStack Query, shadcn UI, i18n.
- Cron — Laravel scheduler в `app/Console/Kernel.php` + системный cron на сервере.
- Уведомления через `notifications` (использует существующую таблицу).
- Файлы (медсправки, документы, payslips) — через текущую инфраструктуру `storage.ts` (приватные ссылки).
- Локализация: новые namespace `leaves`, `performance`, `probation`, `policies`, `immigration`, `internal-jobs`.

---

## Что вне плана (можно добавить позже)

- Генерация payslip в системе (только загрузка PDF, как договорились).
- Интеграция с банками/налоговой.
- Электронная подпись документов.

---

## Подтверждение

Начнём с **Итерации 1 (Отсутствия + Замещения)** — это наиболее запрошенный блок и фундамент для уведомлений и календаря. После её мерджа сразу пойдём в Итерацию 2, потом 3.

Если согласны — нажмите «Implement plan» и я начну с миграций и backend для отпусков/больничных.
