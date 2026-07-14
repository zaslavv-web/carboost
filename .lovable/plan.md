## Что сделаю

Новая artisan-команда `backend-laravel/app/Console/Commands/SeedTrackerTasks.php`:

```
php artisan tracker:seed-tasks
    --owner-email=growthpeak@yandex.ru
    --count=1000
    --projects=6
    --sprints=4
    --marker=tracker150
    --reset       # снести ранее засеянное с этой меткой
    --dry-run
```

### Что она создаёт (в одной `DB::transaction`)

1. **Workflow** «Стандартный» (если у компании ещё нет `is_default=true`):
   - Статусы: `Backlog` (initial, todo), `В работе` (in_progress), `На проверке` (in_progress), `Готово` (done).
   - Переходы: any → any (упрощённо, достаточно для демо).
2. **6 проектов** (`tracker_projects`) с ключами `ONB`, `GRWTH`, `HR`, `MKT`, `PLTF`, `CS`, `lead_id` — руководитель одного из отделов.
3. **4 спринта** (`tracker_sprints`), по одному на первые 4 проекта, `status=active`, диапазон дат последние/ближайшие 2 недели.
4. **1000 задач** (`tracker_tasks`):
   - `company_id = AIGuild`.
   - `author_id` — руководитель отдела автора (случайно из manager+hrd).
   - `assignee_id` — **все пользователи компании AIGuild** (`profiles.company_id` этой компании), включая реальных.
   - `project_id` — случайный из 6.
   - `sprint_id` — 60% задач в одном из активных спринтов, 40% без спринта.
   - `workflow_status_id` — распределение: 40% Backlog, 25% В работе, 15% На проверке, 20% Готово. `status` (legacy string) — маппится: `draft`/`published`/`awaiting_checkin`/`done`.
   - `urgency`/`priority`: low 30% / medium 45% / high 20% / critical 5%.
   - `type`: task 65%, bug 15%, story 15%, epic 5%.
   - `title` — русские шаблоны на осмысленную тему проекта (30-40 паттернов): «Подготовить отчёт по X», «Согласовать бюджет Y», «Обновить регламент Z» и т.п.
   - `description` — 1-3 предложения из пула.
   - `due_at` — рандом ±30 дней от сегодня, `start_at` — сегодня − rand(0..20 дней).
   - `story_points` — 1/2/3/5/8/13 по Фибоначчи.
   - `estimate_minutes` — 60..1200.
   - `labels` — JSON-массив 0-3 меток из пула («срочно», «клиент», «внутренний», «регресс», …).
   - `order_index` — по возрастанию в проекте.
   - `completed_at` — только у задач со статусом Готово (случайно в последние 14 дней).
5. **Маркер** для reset: описание задач начинается с `[tracker150]` (скрыто первой строкой; в UI это не мешает).

### Что НЕ трогаю

- `tracker_comments`, `tracker_attachments`, `tracker_okr_periods`, `tracker_goals`, `tracker_key_results` — не в этой задаче.
- Реальных проектов/спринтов/задач AIGuild — не трогаю; проекты создаю новые с ключами `ONB/GRWTH/HR/MKT/PLTF/CS`, дубликаты проверяю по `(company_id, key)` до вставки.

### Порядок деплоя

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan tracker:seed-tasks --owner-email=growthpeak@yandex.ru --dry-run
php artisan tracker:seed-tasks --owner-email=growthpeak@yandex.ru
```

Ожидание: 4/4 шагов, «Готово: 6 проектов, 4 спринта, 1000 задач».

### Технические заметки

- Схема (`tracker_tasks`, `tracker_projects`, `tracker_sprints`, `tracker_workflows`, `tracker_workflow_statuses`) уже разложена миграциями 0016-0020. Ничего мигрировать не надо.
- Все вставки через `DB::table(...)->insert()` пакетами по 200, чтобы одну транзакцию не раздуть.
- `Schema::hasColumn` для необязательных полей (`workflow_id`, `sprint_id`, `project_id`, `type`, `priority`, `story_points`) — на случай, если на проде часть колонок ещё не добавлена (маловероятно, миграции 0017-0019 применены — видно по migrate:status).

После апрува — реализую и жду вывод `php artisan tracker:seed-tasks`.
