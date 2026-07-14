## Причина

В `tracker_sprints` колонки называются `start_date` / `end_date` (миграция `0019_...`), а команда пишет `starts_at` / `ends_at`. Плюс ключи попадают в insert даже при `Schema::hasColumn == false`, потому что запись ведётся через `'starts_at' => hasColumn ? $x : null` — ключ добавляется всегда.

## Правка

Файл `backend-laravel/app/Console/Commands/SeedTrackerTasks.php`, метод `createSprints()`:

1. Переименовать поля на актуальные: `start_date`, `end_date`.
2. Добавлять поля в массив только через условный блок, а не тернарный оператор:

```php
$row = [
    'id' => $sid,
    'company_id' => $this->companyId,
    'project_id' => $projectId,
    'name' => 'Спринт ' . ($i + 1),
    'goal' => "Демо-спринт, двухнедельный цикл. [{$this->marker}]",
    'status' => 'active',
    'position' => $i,
    'created_at' => now(),
    'updated_at' => now(),
];
if (Schema::hasColumn('tracker_sprints', 'start_date')) $row['start_date'] = $starts;
if (Schema::hasColumn('tracker_sprints', 'end_date'))   $row['end_date']   = $ends;
// fallback на старые названия, если БД мигрирована иначе
if (Schema::hasColumn('tracker_sprints', 'starts_at'))  $row['starts_at']  = $starts;
if (Schema::hasColumn('tracker_sprints', 'ends_at'))    $row['ends_at']    = $ends;
DB::table('tracker_sprints')->insert($row);
```

Аналогично профилактически прошёлся бы по остальным условным полям (`tracker_tasks`: `sprint_id`, `project_id`, `workflow_id`, ...): убедиться, что они добавляются только через `if (hasColumn) $row[...] = ...`. Быстрый аудит показывает, что в `createTasks` это уже сделано правильно — только в `createSprints` баг.

## Про state базы

Предыдущий запуск оборвался внутри одной `DB::transaction`, поэтому workflow/проекты/спринты откатились. `--reset` не нужен.

## Порядок

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
php artisan tracker:seed-tasks --owner-email=growthpeak@yandex.ru --dry-run
php artisan tracker:seed-tasks --owner-email=growthpeak@yandex.ru
```

Ожидание: `Проекты: 6, спринты: 4, задачи: 1000`.
