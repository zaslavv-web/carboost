Извиняюсь за задержку — режим переключился обратно в plan. План тот же, что был одобрен, повторяю без изменений, чтобы вы могли снова нажать «Approve» и я сразу приступил.

## 1. Краш при переходе в «Карьерные треки»

- Обернуть маршруты `/career-track`, `/career-tracks-mgmt`, `/career-reviews` в `ErrorBoundary`, чтобы вместо белого экрана видеть стек.
- Воспроизвести через Playwright (сессия сейчас `signed_out` — сначала логин под HRD/employee), снять console + stack.
- Точечный фикс по результату (guard/optional chaining), без переписывания страниц.

## 2. Сайдбар: выравнивание

Единая сетка отступов в `AppSidebar.tsx`:
- Общие константы `pl-3`, `w-5 h-5` (единый бокс иконки), `gap-2.5` для section header / item / group child.
- Убрать `ml-[26px]` у детей группы; вместо сдвига — тонкий `border-l` в контейнере группы + `pl-3`.
- Активный маркер `w-[3px]` в `absolute left-0` для всех уровней.
- Выровнять flyout collapsed-режима под ту же сетку.

## 3. Консолидация меню (сокращение до 1 экрана)

- **Communication**: только Сообщения, Лента, Сообщества. Recognition → таб в Ленте; Pulse-опросы → в Аналитику; Приглашения → в Настройки; Уведомления — колокольчик в топбаре (уже есть).
- **Analytics (HRD)**: Дашборд, People Analytics (сливает `/analytics` + `/risk-analytics` вкладками), Pulse-опросы. Группа «Оценка» без изменений.
- **HR (HRD)**: Онбординг + Планы адаптации → один пункт «Онбординг» с табами. HR-политики + Персональные HR-документы → группа «Документы».
- **Employee/Manager**: AI-ассессмент и Опросник → табы в «Мой профиль». Probation у employee — только при активной пробации.
- **Knowledge**: `rag-documents` + `knowledge-base` → один пункт «База знаний» (страницы остаются).
- **System**: Branding + AI + Integrations → вкладки внутри `/settings`. В сайдбаре один пункт «Настройки».

Ожидаемо: HRD 20+ пунктов → ~10–12; employee/manager помещаются без скролла.

## Файлы

`src/components/AppSidebar.tsx`, `src/components/RoleAwareLayout.tsx` (career ErrorBoundary — точечно), `src/pages/CareerTrack.tsx` / `CareerTracksManagement.tsx` (фикс краша), `src/pages/Settings.tsx`, `PeopleAnalytics.tsx`, `CorporateFeed.tsx`, `MyProfile.tsx`, `Onboarding.tsx` — добавить вкладки-обёртки. `src/App.tsx` — маршруты сохраняются.

Backend/данные не меняются.

## Открытые вопросы (по умолчанию — «да»)

1. Слить `/analytics` + `/risk-analytics` в одну страницу с вкладками.
2. Слить `/rag-documents` + `/knowledge-base` в один пункт.
3. Свернуть Branding/AI/Integrations в вкладки `/settings`.

Если по одному из пунктов «нет» — напишите; иначе просто одобрите план и я начну.