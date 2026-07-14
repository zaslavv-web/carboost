## Данные

### Миграция БД (Laravel)

**Новая таблица `pulse_survey_targets**` — многозначный таргетинг одного опроса:

- `survey_id` (uuid, fk)
- `company_id` (uuid)
- `target_type` enum: `department` | `subdivision` | `position` | `user`
- `target_ref` (uuid) — id departments/positions/profiles
- unique(`survey_id`, `target_type`, `target_ref`)

**Новая таблица `pulse_survey_invitees**` — «посписочные» email, которых ещё нет в системе:

- `survey_id`, `company_id`, `email`, `status` (`pending` | `resolved` | `invited`), `resolved_user_id` nullable

**Существующая `pulse_surveys**`: значение `audience` расширяется — `company` | `department` | `subdivision` | `position` | `roster` | `mixed`. Поле `audience_ref` больше не используется для multi-таргетинга (оставляем для обратной совместимости).

GRANT на обе новые таблицы + RLS.

### Про «отделы vs подразделения»

Физически используем существующий `departments` с `parent_id`:

- **Подразделение** = department **верхнего уровня** (`parent_id IS NULL`). Охват = сам department + все дочерние (рекурсивно).
- **Отдел** = department **с parent_id** (дочерний). Охват = только он сам.

Это позволяет иметь «две сущности» без дублирующей таблицы. В UI показываем два разных списка: подразделения (корневые) и отделы (листья/дочерние).

## Backend (Laravel)

Новый контроллер `PulseSurveyController` с endpoints:

- `POST /api/pulse-surveys/{id}/questions/import` — принимает multipart CSV. Парсит колонки `title, kind, options, is_required`. `kind` валидируется, `options` парсится через `;`, `is_required` = `1/0`. Создаёт `pulse_survey_questions` пачкой с корректным `order_index`. Возвращает `{ imported, skipped, errors[] }`.
- `POST /api/pulse-surveys/{id}/targets` — тело `{ targets: [{type, ref}, ...] }`. Атомарная замена существующих таргетов.
- `POST /api/pulse-surveys/{id}/roster/resolve` — тело `{ emails: string[] }`. Возвращает `{ found: [{email, user_id, full_name}], not_found: string[] }` — без записи в БД, для preview.
- `POST /api/pulse-surveys/{id}/roster/commit` — тело `{ user_ids: uuid[], external_emails: string[] }`. Внутренних добавляет в `pulse_survey_targets` как `user`. Внешние email — в `pulse_survey_invitees`.
- `GET /api/pulse-surveys/{id}/audience` — вычисленный список eligible `user_id` из объединения таргетов (department = сам + рекурсивные дети через CTE, subdivision = корневой + все дети, position = все `profiles.position_id`, user = напрямую). Нужно для отображения «Охват: N сотрудников».

Все методы требуют `hrd | company_admin | superadmin` через `AuthUserService::guard()` и фильтр по `company_id`.

## Frontend

### `src/pages/PulseSurveys.tsx`

Добавить в правую карточку опроса две новые кнопки рядом с «+ Вопрос»:

- **«Импорт CSV»** — открывает `ImportQuestionsDialog`.
- **«Назначить»** — открывает `AssignAudienceDialog`.

Показывать под заголовком карточки бейдж «Охват: N сотрудников» из `/audience`.

### `ImportQuestionsDialog` (новый компонент)

- `<input type="file" accept=".csv">` + hint формата: `title, kind, options, is_required`.
- Preview первых 10 строк в таблице.
- Кнопка «Импортировать» → отправляет multipart на backend.
- Toast с результатом `{imported, skipped, errors}`.
- Шаблон скачивания: генерируем на клиенте `Blob` с примером.

### `AssignAudienceDialog` (новый компонент)

Табы:

1. **Подразделения** — чекбоксы по корневым departments (`parent_id IS NULL`) с счётчиком сотрудников.
2. **Отделы** — чекбоксы по дочерним departments, группировка по родителю.
3. **Должности** — чекбоксы по `positions`.
4. **Посписочно** — chip-input email (Enter/Tab/запятая/paste). Кнопка «Проверить» → `POST /roster/resolve` → показывает:
  - блок «Найдены (N)» с именами;
  - блок «Не найдены (M)» — красный алерт с текстом *«Сотрудник с адресом X не найден. Что сделать?»* и на каждый email две кнопки: **«Создать сотрудника»** (открывает существующий `bulk-invite` flow с предзаполненным email) и **«Исправить адрес»** (возвращает email в input для правки).

Внизу — сводный «Охват: N сотрудников» + кнопка «Сохранить назначение», которая шлёт `/targets` + `/roster/commit`.

### Хуки

`src/hooks/usePulseTargeting.ts` — оборачивает вышеупомянутые endpoints через TanStack Query.

## Что не трогаем

- Логику `pulse_survey_responses` и алгоритм статистики — назначения на неё не влияют пока (запись ответов доступна тем, кто в `audience`; фильтрацию можно докрутить в следующем шаге).
- Мобильную вёрстку кнопок — уже адаптивна из прошлой правки.
- Существующее поле `audience/audience_ref` — не удаляем, только перестаём читать при новых опросах.

## Проверка

1. Миграция применяется, `pulse_survey_targets` и `pulse_survey_invitees` появляются.
2. Загрузка CSV с 5 вопросами создаёт 5 записей `pulse_survey_questions`.
3. Назначение по подразделению «Продажи» показывает 12 сотрудников (сумма из дочерних отделов).
4. Ввод несуществующего email `foo@bar.com` показывает алерт «Не найден» с кнопками действий.
5. `/audience` возвращает объединённый уникальный список без дубликатов.  
  
