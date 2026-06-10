# План: расширение профиля сотрудника

Все изменения подвязываются к существующему профилю (страница `Passport.tsx` для self-view и `UsersManagement.tsx` для админ-просмотра). Создаётся новый компонент `UserProfileFull` с табами, который рендерится на маршруте `/users/:userId` и переиспользуется на странице «Мой профиль».

## 1. Email сотрудника в профиле + поиск по email

**Backend (`ProfileController`)**
- В `show()`, `me()`, `index()` подмешивать `email` из `users.email` (join по `profiles.user_id = users.id`).
- В `index()` добавить параметр `?search=` — `WHERE users.email ILIKE %q% OR profiles.full_name ILIKE %q%`.

**Frontend**
- В `UsersManagement.tsx` в строке поиска фильтровать также по `email` (уже есть локальный фильтр — добавить поле).
- В `Passport.tsx` и новой карточке профиля показывать строку «Контакт: email» (кликабельный `mailto:`).

## 2. Продуктовая статистика пользователя (только superadmin)

Эндпоинт уже есть: `GET /analytics/user-timeline?user_id=...` (см. `AnalyticsController::userTimeline`, строки 347-360) — он отдаёт события и сессии конкретного user_id, защищён `abort_if(!$isSuper, 403)`.

**Frontend**
- Новый таб **«Продуктовая аналитика»** в карточке пользователя, видим только если `useRealLaravelPrimaryRole() === 'superadmin'`.
- Внутри: метрики (events, sessions, avg session, errors), график активности по дням (Recharts AreaChart), таблица последних 20 событий, топ-маршруты пользователя.
- Период — селектор 7/14/30/90 дней.

## 3. Похожие сотрудники (по компании и глобально)

**Backend — новый эндпоинт** `GET /profiles/{userId}/similar?scope=company|global&limit=10`
Доступ: сам пользователь, его менеджер (`team_members`), HRD/company_admin той же компании, superadmin.

Алгоритм похожести (без ML, на SQL):
- Базовые признаки целевого пользователя: `position_id`, `department`, текущая ступень `career_track_templates` (через `employee_career_assignments`), множество skills (`competencies.skill_name` с весом `skill_value`).
- Скор для каждого кандидата (исключая самого пользователя):
  - +40 если совпадает `position_id`
  - +20 если совпадает `department`
  - +20 если есть активное назначение на тот же `template_id`
  - +20 * (cosine между векторами компетенций) — реализуется как `SUM(min(a.skill_value,b.skill_value)) / SQRT(SUM(a^2)*SUM(b^2))` по общим skill_name.
- `scope=company` фильтрует по `company_id` целевого пользователя, `scope=global` — по всей базе (для superadmin/HRD).
- Возвращаем top-N: `user_id, full_name, avatar_url, position, department, company_name, similarity_score, matched_reasons[]`.

**Frontend**
- Таб **«Похожие сотрудники»** с двумя вкладками: «В компании» / «По всей платформе» (вторая видна только HRD/company_admin/superadmin).
- Карточки сотрудников + объяснение совпадения (бейджи: «та же должность», «общие навыки: 5», «тот же трек»).

## 4. Бизнес-окружение (BPMN-стиль)

Доступ: сам пользователь, руководитель (через `team_members.manager_id`), HRD, company_admin, superadmin. Менеджер видит только своих подчинённых; HRD — всех в компании.

**Backend — новый эндпоинт** `GET /profiles/{userId}/environment`
Возвращает:
```json
{
  "user": {...},
  "manager": {...},                 // team_members.manager_id -> profiles+users
  "direct_reports": [...],          // team_members.employee_id where manager_id=user
  "department_head": {...},         // departments.head_user_id по profiles.department
  "peers": [...],                   // та же должность/отдел, top 6
  "interactions": [                 // векторы взаимодействия
     {"with_user_id":..., "type":"reports_to|manages|peer|hr_review|recognition", "weight": n}
  ],
  "future_projection": {            // картина через год
     "target_position": {...},      // position_career_paths.next_position_id или career_track_templates.to_position_id
     "track_template": {...},
     "expected_step": n,
     "expected_skills": [...]       // из шагов career_track_templates.steps
  }
}
```

Источники: `team_members`, `departments`, `profiles`, `positions`, `position_career_paths`, `employee_career_assignments` + `career_track_templates`, `peer_recognitions` (для interactions).

**Frontend — React Flow BPMN-диаграмма** (библиотека уже используется в `Scenarios.tsx`/`HRDEmployeeMap`).
- Новый компонент `src/components/UserBusinessEnvironment.tsx`.
- Layout:
  ```text
                 [Руководитель отдела]
                          │
                     [Менеджер]
                          │
        ┌─────── [ Сотрудник ] ───────┐
        │            │                 │
  [Подчинённые]  [Коллеги]    →   [Позиция через год]
  ```
- Узлы BPMN-стиля: pool «Текущее положение» и pool «Через год» (полупрозрачный, пунктирные стрелки). Стрелки подписаны типом взаимодействия. Toggle «Текущее ↔ Через год».
- Таб **«Окружение»** в карточке профиля.

## 5. Контроль доступа

Единый Policy метод `view-stats` на профиле:

| Возможность                  | superadmin | company_admin | hrd | manager (своего) | user (себя) |
|------------------------------|:----------:|:-------------:|:---:|:----------------:|:-----------:|
| Продуктовая аналитика (п.1)  | ✅ | ❌ | ❌ | ❌ | ❌ |
| Похожие в компании           | ✅ | ✅ | ✅ | ✅ | ✅ |
| Похожие глобально            | ✅ | ❌ | ❌ | ❌ | ❌ |
| Бизнес-окружение (п.3)       | ✅ | ✅ | ✅ | ✅ | ✅ |
| Email в профиле              | ✅ | ✅ (своей компании) | ✅ | ✅ | ✅ |

Проверки и на бэке (контроллеры), и на фронте (скрытие табов).

## 6. UI-сборка

- Новый маршрут `/users/:userId` → `UserProfileFull` с табами: **Обзор** (текущий Passport), **Окружение**, **Похожие**, **Продуктовая аналитика** (если superadmin).
- В `UsersManagement.tsx` иконка «Eye» уже есть — направляем на `/users/:userId` вместо impersonation-only.
- На `Passport.tsx` («Мой профиль») те же табы для self.

## Технические детали

**Новые файлы**
- `backend-laravel/app/Http/Controllers/Api/UserInsightsController.php` — `similar()`, `environment()`.
- Роуты в `routes/api.php`:
  - `GET /profiles/{id}/similar`
  - `GET /profiles/{id}/environment`
  - расширить `GET /profiles` и `GET /profiles/{id}` (email).
- `src/pages/UserProfileFull.tsx` + табы.
- `src/components/UserBusinessEnvironment.tsx` (React Flow).
- `src/components/UserSimilarEmployees.tsx`.
- `src/components/UserProductAnalytics.tsx`.
- Хуки: `useSimilarUsers`, `useUserEnvironment`, `useUserProductStats`.

**Без миграций БД** — все данные уже есть в существующих таблицах. Только в `ProfileController` подмешиваем `email` через join.

**Локализация** — все строки добавляются в `ru/common.json` и `ru/admin.json` (проект полностью локализован на ru).

## Открытый вопрос
Для «картины через год» источник целевой позиции: использовать `position_career_paths` (граф карьерных путей) или активный `career_track_templates.to_position_id`? Предлагаю: если есть активный track — берём его; иначе — первый из `position_career_paths` от текущей должности.
