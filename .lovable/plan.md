## Проблема
Попап (tooltip) при наведении на графики Recharts не читается: в большинстве мест задан только `backgroundColor` контейнера (`--card`/`--popover`), а цвет текста и цвет значений/подписей остаются дефолтными Recharts (тёмно-серые), из-за чего на тёмной теме текст сливается с фоном. В части графиков (`PeopleAnalytics`, `GamificationManagement`, `UserProductAnalytics`) `<Tooltip />` вообще без стилей — белый попап с чёрным текстом даже в тёмной теме.

## Решение
Ввести единый стиль tooltip и применить его во всех графиках Recharts.

1. Создать `src/lib/chartTooltip.ts` с экспортами:
   - `chartTooltipContentStyle` — `background: hsl(var(--popover))`, `border: 1px solid hsl(var(--border))`, `borderRadius: 8`, `color: hsl(var(--popover-foreground))`, `boxShadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,.25))`, `fontSize: 12`, `padding: 8px 10px`.
   - `chartTooltipLabelStyle` — `color: hsl(var(--foreground))`, `fontWeight: 600`, `marginBottom: 4`.
   - `chartTooltipItemStyle` — `color: hsl(var(--popover-foreground))`.
   - `chartTooltipCursor` — `{ fill: 'hsl(var(--muted) / 0.35)' }` для BarChart, отдельно `chartTooltipCursorLine` — `{ stroke: 'hsl(var(--border))' }` для Line/Area.
   - Хелпер `tooltipProps(kind?: 'bar'|'line')` возвращает готовый объект пропсов `{ contentStyle, labelStyle, itemStyle, cursor }`.

2. Обновить все места с Recharts `<Tooltip />` на `<Tooltip {...tooltipProps('bar'|'line')} />`:
   - `src/pages/Analytics.tsx` (4 шт.)
   - `src/pages/HRDDashboard.tsx` (3 шт., включая уже кастомный на строке 219 — оставить кастомный content, но привести стили в соответствие)
   - `src/pages/ManagerDashboard.tsx`
   - `src/pages/ProductAnalytics.tsx` (2 шт., переиспользовать вместо локального `tooltipStyle`)
   - `src/pages/PeopleAnalytics.tsx` (5 шт.)
   - `src/pages/GamificationManagement.tsx` (2 шт.)
   - `src/pages/RiskAnalytics.tsx` (2 шт., `RTooltip`)
   - `src/pages/Passport.tsx`, `src/pages/Dashboard.tsx` — привести к единому стилю.
   - `src/components/HRDCareerTracksAnalytics.tsx`
   - `src/components/HRDEmployeeMap.tsx` (`RTooltip`)
   - `src/components/UserProductAnalytics.tsx`
   - `src/components/PathsSankey.tsx`

3. Кастомный tooltip в `src/components/ui/chart.tsx` (`ChartTooltipContent`) — уже использует `bg-background` / `text-foreground`, поэтому там правок не нужно, кроме проверки, что нигде не подмешивается белый фон.

## Проверка
- Playwright под HRD: открыть Dashboard, Analytics, People Analytics, Risk Analytics, Gamification, Career Tracks Analytics — навести курсор на bar/line/pie, снять скриншоты в тёмной и светлой темах, убедиться что текст контрастный.

## Технические детали
Не трогать бизнес-логику и данные графиков — только пропсы `<Tooltip>`. Все цвета через семантические токены (`--popover`, `--popover-foreground`, `--foreground`, `--border`, `--muted`), никаких хардкодов `#fff` / `text-white`.
