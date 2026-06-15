## Тесты для CareerTrack.tsx (вкладка «Награды»)

Новый файл: `src/pages/__tests__/CareerTrack.rewards.test.tsx`.

Стек: `vitest` + `@testing-library/react` + `QueryClientProvider` + `MemoryRouter` (как в существующем `product-buttons.smoke.test.tsx`).

### Что мокаем

- `@/integrations/laravel/db` — функция `laravelDb.from(table)` возвращает chainable-объект (`select/eq/in/order` → thenable). Возвращаем фикстуры по имени таблицы:
  - `gamification_rewards_public` → 2 типа: `{ id: "rt-1", title: "Звезда", icon: "star", points: 10 }`, `{ id: "rt-2", title: "Ракета", icon: "rocket", points: 25 }`. **НЕ содержат** `gift_content`/`monetary_amount`.
  - `employee_rewards` → 2 награды текущего пользователя, ссылающиеся на `rt-1` и `rt-2`.
  - `career_goals`, `goal_checklist_items`, `employee_career_assignments`, `career_track_templates`, `career_level_actions`, `positions` → пустые массивы (нерелевантно).
- `@/hooks/useEffectiveUser` → `useEffectiveUserId` возвращает `"user-1"`.
- `react-i18next` → `useTranslation` возвращает `t: (k, opts) => opts?.count != null ? \`${k}:${opts.count}\` : k`.
- `sonner` → no-op toast.
- `@/components/CareerTrackStepCard` → заглушка, рендерит `null`.

### Сценарии (it-блоки)

Хелпер `renderForRole(role)` устанавливает значение `useEffectiveUserId` (одинаковое для всех ролей — выборка наград идёт по `user_id`), рендерит `<CareerTrack />`, кликает на таб «Награды» (`getByText` по ключу `careerTrack.tabs.rewards` или соответствующему).

Параметризованный `it.each(["employee","manager","hrd","company_admin","superadmin"])`:

1. **Запрос идёт в публичный view** — после mount проверяем, что `laravelDb.from` был вызван с `"gamification_rewards_public"` и **не** с `"gamification_reward_types"`.
2. **Награды и баллы отображаются** — переключаемся на таб «Награды», ждём появления `Звезда` и `Ракета`, `+10`, `+25`, а также суммарных очков `careerTrack.totalPoints:35`.
3. **Чувствительные поля отсутствуют** — в DOM нет текста `gift_content`/`monetary_amount` (sanity-check, что компонент не пытается их рендерить).

Дополнительный тест (не параметризованный):

4. **Пустое состояние** — если `employee_rewards` пуст, отображается `careerTrack.noRewards`, а total = 0.

### Запуск

`bunx vitest run src/pages/__tests__/CareerTrack.rewards.test.tsx` — добавлю в финальный шаг проверки.

### Зачем все 5 ролей

RLS у view одинаков (`GRANT SELECT` для `authenticated`) — компонент не различает роли в запросе, поэтому параметризация — это smoke-проверка, что рендер не падает ни для одной роли (на случай, если в будущем добавятся role-зависимые ветки).