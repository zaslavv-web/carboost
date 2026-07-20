
# Упрощение HRD-интерфейса: режим Today + студии

## Идея одной фразой
Разделить работу HRD на два контура: **Today** — экран «что нужно сделать сегодня» (по умолчанию), и **Studios** — 5 полноэкранных рабочих сред для глубокого погружения. Первый вход спрашивает, какой режим ставить дефолтом. Сайдбар сворачивается в узкий rail из 6 иконок.

## Скоуп первой итерации (прототип)
Собираем работающий прототип и раскатываем только на **одну учётку HRD** (`growthpeak@yandex.ru` в AIGuild). Остальные HRD видят текущий интерфейс без изменений — риск нулевой, обратная связь быстрая.

Флаг переключения: колонка `ui_mode` в `profiles` (`classic` | `today`) + фича-флаг по email/company для канареечной раскатки.

## Экран Today — что там

```text
┌─────────────────────────────────────────────────────────────┐
│  Доброе утро, Дарья.        [⌘K]  [🔔 3]  [Studios ▾]       │
├─────────────────────────────────────────────────────────────┤
│  KPI-полоска: Активных · Риск · Открытых заявок · Пульс     │
├──────────────────────────────────────┬──────────────────────┤
│  ИНБОКС (только то, что требует       │  Календарь недели   │
│  действия HR сегодня):                │  · 1:1 сегодня       │
│  ▸ Отпуск: Иванов, 12–19 авг    [✓][✗]│  · Ревью в пятницу   │
│  ▸ ⚠ Риск выгорания: 4 чел.    [Открыть]│  · Испыт. срок×2   │
│  ▸ IDP на утверждение: Петров   [✓][✗]│                      │
│  ▸ ⚠ Просрочен испыт.: Сидоров [Открыть]│  Быстрые действия  │
│                                        │  + Пригласить       │
│  [Показать все · 12]                   │  + Опрос             │
│                                        │  + Объявление        │
└──────────────────────────────────────┴──────────────────────┘
```

**Что попадает в инбокс (итерация 1):**
1. Заявки на отпуск (`leaves` со статусом `pending`) — apruve/reject прямо из карточки.
2. Апрувы IDP и career-review (`individual_development_plans`, `career_reviews` со статусом `pending_approval`).
3. Алерты рисков (выгорание, отток, снижение комфорта) из `risk_analytics` / `comfort_index` — с deep-link в Analytics Studio.
4. Просроченные испытательные (`probation` с `end_date < today` и `status != completed`).

Всё сортируется: сначала просрочки → сегодня → эта неделя. Snooze откладывает карточку на N дней.

## Пять студий (навигация)

Rail слева, 6 узких иконок (48px), tooltip при наведении. Клик — переход в полноэкранный workspace-shell (уже есть в трекере).

| Иконка | Студия | Что внутри (маппинг существующих страниц) |
|---|---|---|
| 🏠 | **Today** | этот новый экран |
| 👥 | **People** | UsersManagement, Passport, SkillsMatrix, Positions, org-структура, CareerTracks, IDP |
| 📊 | **Analytics** | HRDDashboard-виджеты, PeopleAnalytics, RiskAnalytics, Comfort*, ProductAnalytics |
| 🎓 | **Learning** | University, Courses, Adaptation, Probation, Onboarding, Assessment |
| 🎉 | **Culture** | Recognition, Gamification, Shop, Feed, PulseSurveys, Communities |
| ⚙️ | **Ops** | HRPolicies, HrDocuments, Leaves (настройки), Disciplinary, Invitations, Support |

Внутри студии — свой мини-rail с вложенными разделами. То, что сейчас 25+ пунктов в плоском сайдбаре, становится 6 корневых → максимум 5–7 в каждой.

## Первый вход: выбор режима

Модалка при первом логине HRD (после этой раскатки):
- **«Ежедневный режим (Today)»** — рекомендуется, инбокс + KPI.
- **«Классический (все модули)»** — старый сайдбар.

Выбор пишется в `profiles.ui_mode`. Переключается позже в настройках профиля.

## Технический раздел

### Frontend
- `src/pages/hrd/Today.tsx` — новый экран, композит из 4 виджетов: `InboxWidget`, `KpiStrip`, `WeekCalendar`, `QuickActions`.
- `src/components/hrd/inbox/` — `LeaveApprovalCard`, `IdpApprovalCard`, `RiskAlertCard`, `ProbationCard` + общий `InboxItem` тип с полями `{id, kind, severity, actor, title, subtitle, dueAt, actions[]}`.
- `src/hooks/useHrdInbox.ts` — параллельные `useQuery` к четырём источникам, merge + сортировка.
- `src/components/hrd/StudioRail.tsx` — узкий rail (`w-14`) поверх `AppSidebar` в HRD-режиме. Основан на существующем `Sidebar` (shadcn `collapsible="icon"`).
- `src/pages/hrd/StudioLayout.tsx` — обёртка WorkspaceShell для внутренней навигации студии (уже есть `WorkspaceShell` в `src/components/workspace/`).
- `RoleAwareLayout.tsx` — ветка: если `role === "hrd"` и `ui_mode === "today"` → рендерим новый shell; иначе — текущий `AppLayout`.
- `src/components/hrd/FirstLoginModePicker.tsx` — модалка выбора при `ui_mode === null`.

### Backend (`backend-laravel`)
- Миграция: `profiles.ui_mode` (`enum('classic','today')` nullable).
- RPC `hrd_inbox` (`RpcController@hrdInbox`): union из pending leaves + IDP approvals + risk alerts + overdue probations, отфильтрованных по `company_id`. Возвращает нормализованный список `InboxItem[]`. Read-only, без побочных эффектов.
- Endpoint для quick-actions (approve/reject) — уже существуют в `LeaveController`, `IndividualDevelopmentPlanController`. Просто дёргаем их из карточек.
- Фича-флаг: массив email в `config/features.php` → `today_ui_allowlist`. Пока только `growthpeak@yandex.ru`. `RoleAwareLayout` проверяет через `useAuth().user.email`.

### Что не трогаем в этой итерации
- Не переписываем существующие страницы модулей — только собираем их под rail студий.
- Не убираем классический сайдбар — он остаётся для всех, кроме одного canary-пользователя.
- Не делаем полноценный ⌘K command palette — только placeholder-кнопка (следующая итерация).
- Не трогаем UI других ролей (Employee/Manager/Admin) — их упрощение идёт отдельными планами.

## Порядок работ
1. Миграция `profiles.ui_mode` + фича-флаг в config.
2. RPC `hrd_inbox` + тест на AIGuild-данных.
3. `Today.tsx` + 4 виджета + `useHrdInbox`.
4. `StudioRail` + `RoleAwareLayout` ветка + `FirstLoginModePicker`.
5. Обёртки-заглушки студий (просто рендерят существующие страницы внутри WorkspaceShell — реорганизация подпунктов позже).
6. Прогон под `growthpeak@yandex.ru` на проде: логин → выбор режима → инбокс → апрув отпуска → переход в студию.

## Критерий готовности прототипа
HRD `growthpeak@yandex.ru` после логина видит Today-экран с реальными данными AIGuild, может из него принять/отклонить заявку на отпуск, открыть карточку риска и перейти в Analytics Studio, а также вернуться в классический режим через профиль.

## Что дальше (не в этой итерации)
- Опросить canary-пользователя, доработать инбокс.
- Command palette (⌘K).
- Раскатка на всех HRD с default = today.
- Аналогичная модель для Manager (`Today` = 1:1 + апрувы своей команды) и Employee (`Today` = мои задачи + IDP + признание).
