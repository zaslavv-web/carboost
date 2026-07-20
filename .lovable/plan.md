## Где лежат правки

Все изменения по HRD Today закоммичены во **фронтенд-репозиторий** этого проекта (Lovable = React/Vite):

- `src/lib/hrdUiMode.ts` — allowlist + localStorage
- `src/hooks/useHrdInbox.ts` — агрегация инбокса
- `src/pages/hrd/Today.tsx` — экран Today
- `src/components/hrd/` — `StudioRail`, `HrdTodayLayout`, `FirstLoginModePicker`, `KpiStrip`, `QuickActions`, `WeekCalendar`, `inbox/InboxCard`
- `src/components/RoleAwareLayout.tsx` — ветка на Today-режим
- `src/App.tsx` — маршрут `/today`

Бэкенд (`backend-laravel/`) я в этой итерации не трогал — прототип использует уже существующие endpoints (`leavesApi`, `probationApi`, `employee_risk_scores`), никаких миграций и контроллеров добавлять не нужно.

## Почему ты их не видишь

Две независимые причины — и обе объясняют, почему «пусто»:

1. **Ты сейчас смотришь превью старого коммита** (`a0a108be`, «Добавлена Волна 3 Performance», 2026-07-01) — это до всех правок HRD Today. Нужно вернуться на актуальную ветку (кнопка выхода из просмотра истории / Latest), тогда в Lovable-превью появится `/today`.
2. **На боевом (`growth-peak.pro`) фронт задеплоен отдельно** — Lovable-коммиты сами туда не уезжают. Прод-фронт собирается из этого же репо командами из `DEPLOYMENT.md`:
  ```
   git pull
   bun install
   bun run build     # артефакты в dist/
  ```
   и `dist/` раздаётся nginx'ом (см. `deploy/nginx.conf` / `docker-compose.yml`). Пока этот шаг не выполнен на сервере — прод показывает старый билд.

## Что предлагаю сделать сейчас

1. Выйти из просмотра истории в Lovable → открыть `https://id-preview--ab323b5c-…lovable.app/today` под `growthpeak@yandex.ru` и убедиться, что Today-экран рендерится на актуальном коммите.

ссылка не работает

1. Если в превью всё ок — на сервере в каталоге фронта выполнить `git pull && bun install && bun run build` (или пересобрать Docker-образ `career-track-web`), после чего проверить `https://growth-peak.pro/today` под той же учёткой.
2. Если в п.1 экран не появляется — прислать URL и скриншот, разберу почему allowlist/маршрут не срабатывают.

Бэкенд-правок в этой итерации не требуется; миграций накатывать не нужно.