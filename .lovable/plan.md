# Аудит модулей и план реализации

Легенда: ✅ есть, 🟡 частично / нужна доработка, ❌ отсутствует.

## Часть 1. Аудит текущего состояния

### Модуль 2. Онбординг


| #   | Функция                            | Статус | Что есть в продукте                                                                                                                                                                                                                  |
| --- | ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1 | Автоматизированные треки адаптации | 🟡     | `src/pages/Onboarding.tsx`, `CompanyOnboardingSettings.php`, `career_track_templates` (общие карьерные треки). Привязки шагов к role/department/grade и отдельной сущности «Onboarding Plan» с задачами/материалами/встречами — нет. |
| 2.2 | Назначение бадди (наставника)      | ❌      | Ни модели `Buddy`, ни поля `buddy_id`, ни соответствующих задач. Есть только `manager_id` в профиле.                                                                                                                                 |
| 2.3 | Чек-листы адаптации                | 🟡     | Есть общий `goal_checklist_items` (для целей). Спец-чек-листа онбординга с ролями «сотрудник/руководитель» и шаблонами (документы, оборудование, доступы, 1-я неделя/месяц) — нет.                                                   |
| 2.4 | Уведомления о прогрессе адаптации  | 🟡     | Общая `Notification` система есть, но триггеров «просрочен шаг онбординга», «этап завершён» — нет.                                                                                                                                   |


### Модуль 3. Обучение и развитие


| #   | Функция                             | Статус | Комментарий                                                                                                                                                                   |
| --- | ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | LMS с конструктором курсов          | 🟡     | `University.tsx`, `CourseView`, `CourseAuthoring`, `CertificateView` — есть. Загрузка видео/документов — базово. **SCORM-пакеты — нет** (в коде не найдено).                  |
| 3.2 | Индивидуальные планы развития (ИПР) | 🟡     | Есть `CareerTrack`, `CareerGoal`, `Competency`, `career_track_templates`. Полноценного ИПР-объекта (с привязкой курсов+мероприятий+целей+сроков в одном представлении) — нет. |
| 3.3 | База знаний                         | 🟡     | `RagDocuments.tsx` = загрузка документов в RAG. UI витрины «База знаний» (категории, поиск, FAQ, регламенты) — нет.                                                           |
| 3.4 | Сертификация и аттестация           | 🟡     | `CertificateView` + `HRDTests` (`ClosedQuestionTest`) есть. Срока действия сертификата, ре-аттестации, регуляторного расписания — нет.                                        |


### Модуль 4. Управление эффективностью


| #   | Функция                              | Статус | Комментарий                                                                                                                                                                                  |
| --- | ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Постановка и трекинг целей (OKR/KPI) | ✅      | `TrackerGoal`, `TrackerKeyResult`, `TrackerOkrPeriod`, `TrackerTaskGoalLink`, страницы `TrackerGoals`, `TrackerDashboard`. Каскадирование компания→департамент→команда — стоит проверить UI. |
| 4.2 | Оценка 360                           | 🟡     | `PerformanceReviewFeedback`, поле `peer_score`. Полного конструктора опросника, анонимности, приглашения оценщиков — нет.                                                                    |
| 4.3 | Performance Review                   | ✅      | `PerformanceCycle`, `PerformanceReview`, `src/pages/Performance.tsx`.                                                                                                                        |
| 4.4 | Матрица компетенций (Skills Matrix)  | 🟡     | Есть `Competency` (по пользователю) и `Position.required_skills` (в `Positions.tsx`). Отдельного отчёта «Skills Matrix» команды/компании с визуализацией gaps — нет.                         |


### Модуль 5. Портал и коммуникации


| #   | Функция                          | Статус | Комментарий                                                                                                                 |
| --- | -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Лента новостей / портал          | ❌      | Нет модели `NewsPost`/`Announcement`, нет страницы Feed.                                                                    |
| 5.2 | Сообщества / группы по интересам | ❌      | Есть только 1:1/групповые чаты (`ChatConversation`), нет сущности «Community/Group» с постами/файлами/событиями.            |
| 5.3 | Pulse-опросы / eNPS              | ❌      | Моделей `Survey/SurveyQuestion/SurveyResponse` нет.                                                                         |
| 5.4 | Recognition                      | ✅      | `PeerRecognition`, `PeerRecognitionReaction`, `Recognition.tsx`, интеграция с корпвалютой.                                  |
| 5.5 | Геймификация                     | ✅      | `GamificationLevel`, `GamificationRewardType`, `Achievement`, `CurrencyBalance/Transaction`, магазин `Shop*`, `LevelBadge`. |


### Модуль 6. Core HR


| #   | Функция                           | Статус | Комментарий                                                                                                                                        |
| --- | --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | График отпусков                   | ✅      | `LeaveType`, `LeaveRequest`, `LeaveBalance`, `LeaveCompensation`, `Leaves.tsx`.                                                                    |
| 6.2 | Управление командировками         | ❌      | Ни моделей, ни страниц.                                                                                                                            |
| 6.3 | Учёт рабочего времени             | ❌      | Табельный учёт/интеграция с СКУД отсутствует.                                                                                                      |
| 6.4 | Управление отсутствиями           | 🟡     | Покрыто `LeaveType` (можно завести больничный/за свой счёт/учебный) — надо убедиться, что нужные типы засеяны, и подтянут учёт в табеле (см. 6.3). |
| 6.5 | Льготы и компенсации              | ❌      | Каталога льгот (ДМС/спорт/питание) как сущности — нет. `Shop` — это подарки за корпвалюту, не льготы.                                              |
| 6.6 | Штатное расписание и оргструктура | 🟡     | Есть `Department`, `Position` (штатки), `Positions.tsx` с React Flow карьерных путей. Оргдиаграмма компании (визуал) и бюджет по позициям — нет.   |


### Модуль 7. Аналитика

🟡 Есть `Analytics.tsx`, `HRDDashboard`, `RiskAnalytics`, `ProductAnalytics`, `RiskComputationService`. Требования по «расширению» не детализированы — уточню после ответа.

**Итого:** полностью есть ~6 функций, частично ~11, полностью нет ~7 (2.2, 5.1, 5.2, 5.3, 6.2, 6.3, 6.5).

---

## Часть 2. План реализации (приоритет: Онбординг + L&D)

Работаем волнами. Каждая волна = отдельный набор миграций (backend-laravel), моделей, политик (`BelongsToCompany` + `CompanyScopedPolicy`), CRUD-контроллеров в `Api/`, роутов в `routes/api.php`, страниц и хуков на фронте, пунктов в `AppSidebar` (блок «Моя работа» / «HR-процессы»).

### Волна 1. Онбординг (модуль 2) — закрывает 2.1–2.4

Backend:

- Миграции: `onboarding_plans` (шаблон: role/department/position/grade, длительность), `onboarding_plan_steps` (title, type=task|doc|training|meeting|checklist, order, due_offset_days, responsible=employee|manager|buddy|hr, material_url|course_id|meeting_template), `onboarding_assignments` (user_id, plan_id, buddy_id, manager_id, start_date, status, current_stage), `onboarding_step_progress` (assignment_id, step_id, status, completed_at, completed_by, comment).
- Модели с `BelongsToCompany`, политики через `CompanyScopedPolicy` / `TeamMemberPolicy`.
- Сервис `OnboardingAutoAssignService`: при создании профиля подбирает шаблон по position/department и назначает.
- Джоб/крон `OnboardingProgressWatcher`: раз в сутки создаёт `Notification` при просрочке и завершении этапов (1-я неделя / 1-й месяц / испытательный).

Frontend:

- `pages/onboarding/OnboardingPlans.tsx` (HRD-конструктор), `OnboardingAssignmentDetail.tsx` (сотрудник/руководитель/бадди видят свои шаги), обновление `pages/Onboarding.tsx` под новый API.
- Компоненты: `OnboardingStepList`, `BuddyPicker`, `OnboardingChecklist` (галочки по разделам «документы/оборудование/доступы/знакомство»).
- Добавить пункт в сайдбар в блок «HR-процессы».

### Волна 2. L&D-расширения (модуль 3) — закрывает 3.2, 3.3, 3.4 (+ SCORM для 3.1)

- **3.2 ИПР:** миграция `development_plans` (user_id, period, goals[], mentor_id) + `development_plan_items` (тип: course|book|meeting|goal, ref_id, deadline, status). Страница `pages/DevelopmentPlan.tsx` + виджет в профиле сотрудника. Автогенерация items из gaps `Competency` vs `Position.required_skills`.
- **3.3 База знаний:** миграции `kb_articles` (title, body_md, category_id, tags, published) + `kb_categories`. Отдельная страница `pages/KnowledgeBase.tsx` (поиск + категории + FAQ), режим редактирования для HRD. RAG-документы остаются под капотом, но витрина — отдельная.
- **3.4 Сертификация:** поля `valid_from`, `valid_until`, `is_mandatory`, `renewal_interval_months` в `certificates` (создать таблицу, если её нет), джоб `CertificateExpiryNotifier`, отчёт в `HRDDashboard`.
- **3.1 SCORM:** загрузчик SCORM-пакета в `CourseAuthoring` (парсер `imsmanifest.xml`, хранение в `storage/scorm`), рендер через iframe с SCORM API-обёрткой (`window.API_1484_11`). Требует ~1 sprint отдельно — вынесу в подволну 2b.

### Волна 3. Performance-догон (4.2, 4.4)

- 360: `review_survey_templates`, `review_survey_questions`, `review_evaluations` (reviewer_id, target_user_id, is_anonymous). UI кампании оценки в `pages/Performance.tsx`.
- Skills Matrix: страница `pages/SkillsMatrix.tsx` — таблица «сотрудник × компетенция», подсветка gaps относительно позиции; фильтры по департаменту/команде.

### Волна 4. Портал и коммуникации (5.1, 5.2, 5.3)

- `news_posts` + `news_reactions` + `news_comments`, лента на `Dashboard`.
- `communities` + `community_members` + `community_posts` + `community_events`.
- `surveys` + `survey_questions` + `survey_responses` + шаблон eNPS, виджет «Пульс» в HRD-дашборде.

### Волна 5. Core HR-догон (6.2, 6.3, 6.5, 6.6-визуал)

- Командировки: `business_trips`, страница-заявка, согласование в цепочке `manager → hrd`, экспорт для бухгалтерии (CSV).
- Табель: `time_entries` + `attendance_days`, ручной ввод + импорт CSV из СКУД (интеграция — отдельная задача заказчика).
- Льготы: `benefit_catalog` + `benefit_requests` + `benefit_usage`. Не смешивать с `Shop*`.
- Оргструктура: `pages/OrgChart.tsx` на React Flow из `Department` + `Position` (у нас уже стоит `@xyflow/react` в карьерных путях).

### Волна 6. Аналитика (7)

Уточнить требования отдельно (что именно расширить: срезы, экспорт, кастомные дашборды).

---

## Технические детали

- Все новые таблицы в `public` создаются с `company_id uuid not null`, индексом по `company_id`, включённой RLS-логикой на уровне Laravel-политик (`BelongsToCompany` scope + `CompanyScopedPolicy`).
- CRUD-контроллеры наследуются от `CrudController`, роуты — в `routes/api.php` внутри `middleware(['auth:sanctum','ensure.verified','ensure.company','effective.user'])`.
- Фронт: TanStack Query hooks в `src/hooks/*`, доступ через `laravelDb` (`/api/db/*`), формы на shadcn.
- Новые пункты меню — в `AppSidebar` по существующим блокам (Communication, My Work, HR Processes, Analytics), с учётом Photoshop-style свёртков.
- Каждая волна = отдельный набор миграций + обновление `DATABASE_STRUCTURE.md`.
- Изменения на витрине (лендинг/прайс) отложены: сначала фича, потом маркетинг.

## Оценка объёма (грубо)


| Волна                  | Модели | Страницы  | Оценка              |
| ---------------------- | ------ | --------- | ------------------- |
| 1. Онбординг           | 4      | 3         | S–M                 |
| 2. L&D (без SCORM)     | 4      | 3         | M                   |
| 2b. SCORM              | 1      | доработка | S                   |
| 3. Performance-догон   | 3      | 2         | M                   |
| 4. Портал/коммуникации | 9      | 3         | L                   |
| 5. Core HR-догон       | 5      | 4         | L                   |
| 6. Аналитика           | —      | 1–2       | S (после уточнения) |


## Что предлагаю сделать первым в build-mode

Волна 1 (Онбординг) целиком: миграции + модели + политики + CRUD + фронт + сайдбар. После этого — волна 2 по L&D.

Дальше по вашему приказу двигаемся по волнам; аналитику (модуль 7) уточним отдельным вопросом, когда дойдём.  
  
Хорошо  
запускай волны без моего уведомления  
после каждой волны запускай полную проверку всего функционала и сразу правь ошибки

Соблюдай заложенную UX логику интерфейса

&nbsp;