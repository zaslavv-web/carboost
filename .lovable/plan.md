## Что чиню

### 1. Дубль «Сотрудники / Пользователи» в сайдбаре HRD
`src/components/AppSidebar.tsx`, ветка `role === "hrd"`, группа `employeesGroup`. Сейчас:

```
Сотрудники (группа)
├── Сотрудники   ← /employees
├── Пользователи ← /users   ← дубль + HRD сюда нельзя
└── Онбординг   ← /onboarding
```

`/users` для HRD уже редиректится на `/dashboard` через `RoleAwareLayout` (admin-only). Удаляю строку `{ icon: UserCog, label: t("nav.users"), path: "/users" }` из children HRD. У `company_admin` / `superadmin` пункт остаётся.

### 2. HRD видит чужих на карте сотрудников (`HRDEmployeeMap`)
`src/components/HRDEmployeeMap.tsx` дергает `laravelDb.from("profiles").select(...)` без фильтра по компании. На бэке `Profile` уже под `BelongsToCompany`, но запрос идёт через `DbController` — где-то скоуп снимается, иначе утечки бы не было.

Двойная защита:

**Фронт (видно сразу):**
- Подтянуть `companyId` через `useUserProfile()` (`profile.company_id`).
- Добавить `.eq("company_id", companyId)` ко всем запросам в `HRDEmployeeMap.tsx`, тянущим списки: `profiles`, `team_members`, `hr_tasks`, `currency_balances`, `employee_career_assignments`, `employee_rewards`.
- Все `useQuery` обернуть в `enabled: !!companyId`, чтобы не было «нулевого» прогона без фильтра.

**Бэк (закрываю дыру в принципе):**
- В `backend-laravel/app/Http/Controllers/Api/DbController.php` проверить, что для моделей с `BelongsToCompany` НЕ применяется `withoutGlobalScopes()` для не-superadmin. Если применяется — обернуть в `if ($user->hasRole('superadmin'))`.
- Тест в `DbControllerTest`: `actingAs(hrd) → GET /api/db/profiles` возвращает только записи своей компании.

### 3. Лендинг на мобиле
По скрину видно: герой ок, но 16 модулей превращаются в 4 крошечных столбца с нечитаемым текстом (~10px), категория «01 Развитие и карьера» сжата сбоку и тоже мелкая. На 360-420px такая плотность нечитаема.

`src/components/landing/ModulesGrouped.tsx`:
- Mobile (`< md`): сетка тайлов **1 столбец** с горизонтальным layout (иконка слева 40×40, текст справа) — `flex` карточки, `min-h-[64px]`, кегль 14/12. Tablet (`md`): 2 столбца. Desktop (`lg`): 4 столбца. Сейчас mobile `grid-cols-2` + 92px высота — отсюда «спички».
- Категория-заголовок: на мобиле выводить горизонтальной плашкой над списком (`text-base` + kicker), а не сжатой колонкой 180px. Текущий `md:grid-cols-[180px_1fr]` уже даёт 1 колонку на мобиле, но визуально съезжает — выровнять `mb-2`, убрать `items-center`.
- Hero: блок метрик `-34% / -12ч / +27%` сейчас в 3 колонки и режется по краям → на мобиле в 1 колонку (`grid-cols-1 sm:grid-cols-3`), цифры крупнее (`text-3xl`).
- `HeroDashboardMock`: проверить, что не вылезает за `100vw` (max-width: `calc(100vw - 32px)`, `overflow-hidden` на контейнере).

### Не трогаю
- Структуру меню других ролей.
- Лендинг кроме модулей/метрик/мок-дашборда.
- Серверные политики (PeerRecognition/Shop/Tracker) — вне скоупа.

## Технические детали

Файлы:
- `src/components/AppSidebar.tsx`
- `src/components/HRDEmployeeMap.tsx`
- `src/components/landing/ModulesGrouped.tsx`
- `src/components/landing/HeroMetricsStrip.tsx`
- `src/components/landing/HeroDashboardMock.tsx`
- `backend-laravel/app/Http/Controllers/Api/DbController.php`
- `backend-laravel/tests/Feature/DbControllerTest.php`

Без миграций и i18n. Проверка: Playwright под HRD `muxtar2005@gmail.com` → `/dashboard` (счётчик карты сотрудников = 13), сайдбар без «Пользователи», лендинг `https://growth-peak.pro` на 390×844.
