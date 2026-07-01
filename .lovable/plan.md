
# План: полный аудит кода Growth Peak

## Скоуп
Frontend (`src/**`), Backend Laravel (`backend-laravel/**`), инфраструктура (Docker, nginx, GitHub Actions, deploy/), тесты и документация. Фокус: безопасность, производительность, архитектура/качество, UX/a11y/i18n.

## Формат вывода
1. Единый структурированный отчёт `docs/AUDIT.md` с ссылками `file:line`, приоритетами P0–P3, разделами по 4 фокусам.
2. Отдельно `docs/AUDIT-FIX-LOG.md` — что автоматически поправлено в рамках этой итерации.
3. В чате — краткое резюме (топ-10 находок + список применённых фиксов).

## Этапы

### Этап 1. Сбор объективных сигналов (read-only)
- `code--dependency_scan` — npm уязвимости.
- `supabase--linter` + `security--get_scan_results` + `security--run_security_scan` — RLS/политики/секреты.
- `supabase--slow_queries` — топ медленных запросов.
- `rg` по кодовой базе:
  - секреты и подозрительные литералы (`API_KEY`, `SECRET`, `password`, `Bearer `, `.env` дампы, hardcoded токены);
  - опасные паттерны (`dangerouslySetInnerHTML`, `eval(`, `Function(`, `innerHTML`, `document.write`, `target="_blank"` без `rel="noopener"`);
  - Laravel: `DB::raw` с интерполяцией, `Route::any`, отсутствие `authorize()` в контроллерах, прямые `where('company_id', ...)` в обход `BelongsToCompany`, публичные роуты без throttle, `withoutGlobalScopes` без обоснования;
  - N+1: контроллеры без `$with`/`load()`, `foreach` с ленивыми relations;
  - миграции без `GRANT` для новых public-таблиц, без RLS/policy.
- Обзор `.github/workflows/*.yml`, `Dockerfile`, `deploy/nginx.conf`, `docker-compose*.yml` — секреты в логах, права рута, устаревшие базовые образы, отсутствующие security-headers, CORS, CSP.
- Обзор `src/**`: 
  - лишние `console.log`, `any`, `@ts-ignore`;
  - утечки токенов в localStorage/логи;
  - тяжёлые импорты (recharts, xlsx, react-flow) без `lazy()`;
  - обработка ошибок API (`translateBackendError`, ErrorBoundary покрытие);
  - i18n: недостающие ключи ru/en (сверка ключей между локалями);
  - a11y-паттерны из встроенного skill (icon-only кнопки без `aria-label`, `<div onClick>`, `h-screen` вместо `h-dvh`, повторы `id`).

### Этап 2. Классификация находок
Каждой находке присваивается:
- **Severity**: P0 (critical/security) · P1 (high) · P2 (medium) · P3 (nice-to-have)
- **Категория**: Security · Performance · Architecture · UX/a11y/i18n · Infra
- **Ссылка**: `path/to/file.ts:LN`
- **Fix effort**: XS/S/M/L

### Этап 3. Сборка отчёта `docs/AUDIT.md`
Структура:
```text
1. Executive summary (счётчики P0/P1/P2/P3 по категориям)
2. Топ-10 приоритетных проблем
3. Security
   3.1 Backend (политики, RLS, GRANT, CSRF, CORS, secrets)
   3.2 Frontend (XSS, токены, target=_blank, валидация форм)
   3.3 Infra (workflows, Dockerfile, nginx, .env)
4. Performance
   4.1 Backend (N+1, индексы, slow queries)
   4.2 Frontend (bundle, lazy, memo, tanstack cache keys)
5. Architecture & Code Quality
   5.1 Backend (нарушения BelongsToCompany/BasePolicy, дубли контроллеров, мёртвый код)
   5.2 Frontend (дублирующиеся компоненты, устаревшие модули, legacy Supabase)
6. UX / a11y / i18n
   7. Tests & Documentation gaps
8. Приложение: команды для воспроизведения аудита
```

### Этап 4. Автофиксы (P0/P1, не ломающие поведение)
Применяю только очевидные и безопасные правки. Каждая — с одной атомарной причиной. Кандидаты (уточняются по итогам этапа 1):
- Добавить недостающие `GRANT` и `enable RLS` в миграциях, где их нет.
- Убрать `withoutGlobalScopes` без обоснования либо задокументировать.
- Добавить `rel="noopener noreferrer"` ко всем `target="_blank"`.
- Заменить `h-screen` → `h-dvh` на верхнеуровневых обёртках мобильных экранов.
- Добавить `aria-label` icon-only кнопкам (shadcn `Button size="icon"`).
- Убрать оставшиеся `console.log` с потенциальными PII (email, token).
- Добавить `lazy()` для тяжёлых редко используемых страниц (Recharts-only, xlsx, react-flow) если не сделано.
- Проставить недостающие индексы БД, где slow_queries покажет очевидный кандидат (только через миграцию, без `CONCURRENTLY`).
- Синхронизировать ключи i18n между ru/en (добавить недостающие, помеченные как TODO).
- Обновить уязвимые npm-пакеты, если фикс minor/patch.

Все нетривиальные правки (рефакторинги, изменения политик, удаление модулей) — **только в отчёте как рекомендации**, без применения.

### Этап 5. Верификация
- `tsgo` (типы) и `bunx vitest run` (быстрые тесты) после автофиксов.
- Прогон `supabase--linter` повторно, чтобы подтвердить закрытие P0.
- Обновление `security-memory` через `security--update_memory` — фиксирую что закрыто, чтобы сканер не поднимал повторно.

## Что НЕ делаю в этой итерации
- Не переписываю крупные модули (LMS, Tracker, Analytics) — только помечаю замечания.
- Не меняю бизнес-логику политик доступа без явного согласования.
- Не удаляю «мёртвый» код — только помечаю кандидатов на удаление.
- Не трогаю `src/integrations/supabase/client.ts` (заглушка, авто-генерится).

## Ожидаемый результат
- `docs/AUDIT.md` (~800–1500 строк) — карта всех находок с приоритетами.
- `docs/AUDIT-FIX-LOG.md` — журнал применённых автофиксов.
- Несколько атомарных правок в коде (P0/P1 категории «безопасно фиксить автоматически»).
- Резюме в чате с топ-10 и next steps на ручные правки.
