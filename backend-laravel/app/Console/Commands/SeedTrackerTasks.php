<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Заливает демо-задачи трекера в существующую компанию:
 *   - 1 default workflow с 4 статусами (если ещё нет)
 *   - N проектов (по умолчанию 6)
 *   - M активных спринтов (по умолчанию 4)
 *   - COUNT задач, распределённых по assignee = все пользователи компании
 *
 * Идемпотентно: --reset удаляет то, что помечено маркером (описание начинается с [marker]).
 * Реальные задачи/проекты компании не трогаются.
 */
class SeedTrackerTasks extends Command
{
    protected $signature = 'tracker:seed-tasks
        {--owner-email= : Email действующего company_admin/hrd компании}
        {--company-id= : Альтернатива: явный UUID компании}
        {--count=1000 : Количество задач}
        {--projects=6 : Количество проектов}
        {--sprints=4 : Количество активных спринтов}
        {--marker=tracker150 : Метка для идемпотентности}
        {--reset : Удалить всё, что было засеяно этой меткой, и залить заново}
        {--dry-run : Ничего не пишет, только показывает план}';

    protected $description = 'Заливает демо-задачи трекера (проекты + спринты + задачи) в существующую компанию.';

    private string $companyId;
    private ?string $ownerUserId = null;
    private string $marker;

    public function handle(): int
    {
        $this->marker = (string) $this->option('marker');
        $count        = max(1, (int) $this->option('count'));
        $projectsN    = max(1, (int) $this->option('projects'));
        $sprintsN     = max(0, (int) $this->option('sprints'));
        $dryRun       = (bool) $this->option('dry-run');

        // 1. Компания
        [$this->companyId, $this->ownerUserId] = $this->resolveCompanyId();
        if ($this->companyId === '' || $this->ownerUserId === null) {
            $this->error('Не удалось найти компанию/владельца. Укажи --owner-email или --company-id.');
            return self::FAILURE;
        }
        $companyName = (string) DB::table('companies')->where('id', $this->companyId)->value('name');
        $this->info("Компания: {$companyName} ({$this->companyId})");

        // 2. Пул исполнителей (все пользователи компании)
        $assignees = DB::table('profiles')->where('company_id', $this->companyId)->pluck('user_id')->map('strval')->all();
        if (count($assignees) < 2) {
            $this->error('В компании слишком мало пользователей. Сначала запусти org:seed-150.');
            return self::FAILURE;
        }
        // Авторы — руководители/HRD
        $authors = DB::table('user_roles')
            ->join('profiles', 'profiles.user_id', '=', 'user_roles.user_id')
            ->where('profiles.company_id', $this->companyId)
            ->whereIn('user_roles.role', ['manager', 'hrd', 'company_admin'])
            ->pluck('user_roles.user_id')->map('strval')->unique()->values()->all();
        if (empty($authors)) $authors = [$this->ownerUserId];

        $this->line("Пул: assignees=" . count($assignees) . ", authors=" . count($authors));
        $this->line("План: workflow + {$projectsN} проектов + {$sprintsN} спринтов + {$count} задач");

        if ($this->option('reset')) {
            if ($dryRun) $this->warn("[dry-run] удалил бы старые строки с меткой '{$this->marker}'");
            else $this->resetSeed();
        }

        if ($dryRun) {
            $this->info('[dry-run] изменения не применяются.');
            return self::SUCCESS;
        }

        $createdProjects = 0; $createdSprints = 0; $createdTasks = 0;
        DB::transaction(function () use ($projectsN, $sprintsN, $count, $assignees, $authors, &$createdProjects, &$createdSprints, &$createdTasks) {
            $this->info('1/4  Workflow…');
            [$workflowId, $statusIds] = $this->ensureWorkflow();

            $this->info('2/4  Проекты…');
            $projectIds = $this->createProjects($projectsN, $authors, $workflowId, $createdProjects);

            $this->info('3/4  Спринты…');
            $sprints = $this->createSprints($sprintsN, $projectIds, $createdSprints);

            $this->info('4/4  Задачи…');
            $createdTasks = $this->createTasks($count, $projectIds, $sprints, $statusIds, $workflowId, $assignees, $authors);
        });

        $this->info('✅ Готово.');
        $this->line("Проекты: {$createdProjects}, спринты: {$createdSprints}, задачи: {$createdTasks}");
        return self::SUCCESS;
    }

    // ─────────────────────────────────────────────────────────────

    private function resolveCompanyId(): array
    {
        $direct = (string) $this->option('company-id');
        if ($direct !== '') {
            if (!DB::table('companies')->where('id', $direct)->exists()) return ['', null];
            $ownerId = DB::table('user_roles')
                ->join('profiles', 'profiles.user_id', '=', 'user_roles.user_id')
                ->where('profiles.company_id', $direct)
                ->whereIn('user_roles.role', ['company_admin', 'hrd'])
                ->orderByRaw("case user_roles.role when 'company_admin' then 0 when 'hrd' then 1 else 2 end")
                ->value('user_roles.user_id');
            if (!$ownerId) $ownerId = DB::table('profiles')->where('company_id', $direct)->value('user_id');
            return [$direct, $ownerId ? (string) $ownerId : null];
        }
        $email = strtolower((string) $this->option('owner-email'));
        if ($email === '') return ['', null];
        $userId = DB::table('users')->where('email', $email)->value('id');
        if (!$userId) return ['', null];
        $cid = DB::table('profiles')->where('user_id', (string) $userId)->value('company_id');
        return $cid ? [(string) $cid, (string) $userId] : ['', null];
    }

    private function resetSeed(): void
    {
        $needle = '[' . $this->marker . ']';

        // tasks по маркеру в description
        $taskIds = DB::table('tracker_tasks')
            ->where('company_id', $this->companyId)
            ->where('description', 'like', "%{$needle}%")
            ->pluck('id')->map('strval')->all();
        if ($taskIds) {
            foreach (['tracker_comments', 'tracker_attachments', 'tracker_task_goal_links', 'tracker_task_checkins'] as $t) {
                if (Schema::hasTable($t)) DB::table($t)->whereIn('task_id', $taskIds)->delete();
            }
            DB::table('tracker_tasks')->whereIn('id', $taskIds)->delete();
        }

        // sprints по маркеру
        if (Schema::hasTable('tracker_sprints')) {
            $sprintIds = DB::table('tracker_sprints')
                ->where('company_id', $this->companyId)
                ->where('goal', 'like', "%{$needle}%")
                ->pluck('id')->map('strval')->all();
            if ($sprintIds) DB::table('tracker_sprints')->whereIn('id', $sprintIds)->delete();
        }

        // projects по маркеру
        $projIds = DB::table('tracker_projects')
            ->where('company_id', $this->companyId)
            ->where('description', 'like', "%{$needle}%")
            ->pluck('id')->map('strval')->all();
        if ($projIds) DB::table('tracker_projects')->whereIn('id', $projIds)->delete();

        // workflow с меткой
        $wfIds = DB::table('tracker_workflows')
            ->where('company_id', $this->companyId)
            ->where('description', 'like', "%{$needle}%")
            ->pluck('id')->map('strval')->all();
        if ($wfIds) {
            if (Schema::hasTable('tracker_workflow_transitions')) DB::table('tracker_workflow_transitions')->whereIn('workflow_id', $wfIds)->delete();
            if (Schema::hasTable('tracker_workflow_statuses')) DB::table('tracker_workflow_statuses')->whereIn('workflow_id', $wfIds)->delete();
            DB::table('tracker_workflows')->whereIn('id', $wfIds)->delete();
        }

        $this->warn('  reset: tasks=' . count($taskIds) . ', projects=' . count($projIds));
    }

    private function ensureWorkflow(): array
    {
        // если у компании уже есть default workflow с 4+ статусами — используем его
        $existing = DB::table('tracker_workflows')
            ->where('company_id', $this->companyId)
            ->where('is_default', true)
            ->first();
        if ($existing) {
            $statuses = DB::table('tracker_workflow_statuses')
                ->where('workflow_id', $existing->id)
                ->orderBy('position')
                ->get(['id', 'category', 'name', 'key']);
            if ($statuses->count() >= 3) {
                $map = $this->mapStatuses($statuses);
                return [(string) $existing->id, $map];
            }
        }

        $wfId = (string) Str::uuid();
        DB::table('tracker_workflows')->insert([
            'id' => $wfId,
            'company_id' => $this->companyId,
            'name' => 'Стандартный',
            'description' => "Демо-workflow для трекера. [{$this->marker}]",
            'is_default' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $defs = [
            ['key' => 'backlog',     'name' => 'Backlog',      'category' => 'todo',        'position' => 0, 'is_initial' => true,  'color' => '#94a3b8'],
            ['key' => 'in_progress', 'name' => 'В работе',     'category' => 'in_progress', 'position' => 1, 'is_initial' => false, 'color' => '#3b82f6'],
            ['key' => 'review',      'name' => 'На проверке',  'category' => 'in_progress', 'position' => 2, 'is_initial' => false, 'color' => '#f59e0b'],
            ['key' => 'done',        'name' => 'Готово',       'category' => 'done',        'position' => 3, 'is_initial' => false, 'color' => '#10b981'],
        ];
        $statusRows = [];
        $statusIds = [];
        foreach ($defs as $d) {
            $sid = (string) Str::uuid();
            $statusIds[$d['key']] = $sid;
            $statusRows[] = [
                'id' => $sid,
                'workflow_id' => $wfId,
                'company_id' => $this->companyId,
                'key' => $d['key'],
                'name' => $d['name'],
                'category' => $d['category'],
                'color' => $d['color'],
                'position' => $d['position'],
                'is_initial' => $d['is_initial'],
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        DB::table('tracker_workflow_statuses')->insert($statusRows);

        // any → any переходы (упрощение для демо)
        if (Schema::hasTable('tracker_workflow_transitions')) {
            $trans = [];
            foreach ($statusIds as $fromKey => $fromId) {
                foreach ($statusIds as $toKey => $toId) {
                    if ($fromKey === $toKey) continue;
                    $trans[] = [
                        'id' => (string) Str::uuid(),
                        'workflow_id' => $wfId,
                        'company_id' => $this->companyId,
                        'from_status_id' => $fromId,
                        'to_status_id' => $toId,
                        'name' => "{$fromKey}→{$toKey}",
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
            }
            DB::table('tracker_workflow_transitions')->insert($trans);
        }

        return [$wfId, $statusIds];
    }

    private function mapStatuses($statuses): array
    {
        // сопоставим существующие статусы под наши ключи backlog/in_progress/review/done
        $out = ['backlog' => null, 'in_progress' => null, 'review' => null, 'done' => null];
        foreach ($statuses as $s) {
            $cat = strtolower((string) $s->category);
            if ($cat === 'todo' && $out['backlog'] === null) $out['backlog'] = (string) $s->id;
            elseif ($cat === 'done' && $out['done'] === null) $out['done'] = (string) $s->id;
            elseif ($cat === 'in_progress') {
                if ($out['in_progress'] === null) $out['in_progress'] = (string) $s->id;
                elseif ($out['review'] === null) $out['review'] = (string) $s->id;
            }
        }
        // недостающие — берём первый попавшийся
        $first = (string) $statuses->first()->id;
        foreach ($out as $k => $v) if ($v === null) $out[$k] = $first;
        return $out;
    }

    private function createProjects(int $n, array $authors, string $workflowId, int &$counter): array
    {
        $defs = [
            ['key' => 'ONB',   'name' => 'Онбординг 2026',           'color' => '#f59e0b', 'icon' => 'rocket'],
            ['key' => 'GRWTH', 'name' => 'Рост Q3',                  'color' => '#10b981', 'icon' => 'trending-up'],
            ['key' => 'HR',    'name' => 'HR-операции',              'color' => '#8b5cf6', 'icon' => 'users'],
            ['key' => 'MKT',   'name' => 'Маркетинг: осенний пуш',   'color' => '#ef4444', 'icon' => 'megaphone'],
            ['key' => 'PLTF',  'name' => 'Платформа: миграция',      'color' => '#3b82f6', 'icon' => 'server'],
            ['key' => 'CS',    'name' => 'Клиентский успех',         'color' => '#0ea5e9', 'icon' => 'heart'],
            ['key' => 'FIN',   'name' => 'Финансовое планирование',  'color' => '#6366f1', 'icon' => 'chart'],
            ['key' => 'LEG',   'name' => 'Правовая поддержка',       'color' => '#78716c', 'icon' => 'scale'],
        ];
        $ids = [];
        for ($i = 0; $i < $n; $i++) {
            $d = $defs[$i % count($defs)];
            $key = $d['key'];
            // избежать конфликта уникальности (company_id, key)
            $suffix = 0;
            while (DB::table('tracker_projects')->where('company_id', $this->companyId)->where('key', $key)->exists()) {
                $suffix++;
                $key = $d['key'] . $suffix;
            }
            $pid = (string) Str::uuid();
            DB::table('tracker_projects')->insert([
                'id' => $pid,
                'company_id' => $this->companyId,
                'key' => $key,
                'name' => $d['name'],
                'description' => "Демо-проект трекера. [{$this->marker}]",
                'lead_id' => $authors[array_rand($authors)],
                'color' => $d['color'],
                'icon' => $d['icon'],
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $ids[] = $pid;
            $counter++;
        }
        return $ids;
    }

    private function createSprints(int $n, array $projectIds, int &$counter): array
    {
        if ($n === 0 || !Schema::hasTable('tracker_sprints')) return [];
        $sprints = [];
        for ($i = 0; $i < $n; $i++) {
            $projectId = $projectIds[$i % count($projectIds)];
            $sid = (string) Str::uuid();
            $starts = now()->subDays(7)->startOfDay();
            $ends   = now()->addDays(7)->endOfDay();
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
            // Реальные имена колонок из миграции 0019 — start_date/end_date.
            if (Schema::hasColumn('tracker_sprints', 'start_date')) $row['start_date'] = $starts;
            if (Schema::hasColumn('tracker_sprints', 'end_date'))   $row['end_date']   = $ends;
            // Fallback на альтернативные имена, если БД мигрирована иначе.
            if (Schema::hasColumn('tracker_sprints', 'starts_at'))  $row['starts_at']  = $starts;
            if (Schema::hasColumn('tracker_sprints', 'ends_at'))    $row['ends_at']    = $ends;
            DB::table('tracker_sprints')->insert($row);
            $sprints[] = ['id' => $sid, 'project_id' => $projectId];
            $counter++;
        }
        return $sprints;
    }

    private function createTasks(int $count, array $projectIds, array $sprints, array $statusIds, string $workflowId, array $assignees, array $authors): int
    {
        $hasProject   = Schema::hasColumn('tracker_tasks', 'project_id');
        $hasSprint    = Schema::hasColumn('tracker_tasks', 'sprint_id');
        $hasWorkflow  = Schema::hasColumn('tracker_tasks', 'workflow_id');
        $hasWfStatus  = Schema::hasColumn('tracker_tasks', 'workflow_status_id');
        $hasType      = Schema::hasColumn('tracker_tasks', 'type');
        $hasPriority  = Schema::hasColumn('tracker_tasks', 'priority');
        $hasPoints    = Schema::hasColumn('tracker_tasks', 'story_points');
        $hasEstimate  = Schema::hasColumn('tracker_tasks', 'estimate_minutes');
        $hasLabels    = Schema::hasColumn('tracker_tasks', 'labels');
        $hasOrder     = Schema::hasColumn('tracker_tasks', 'order_index');
        $hasStart     = Schema::hasColumn('tracker_tasks', 'start_at');

        $titles = [
            'Подготовить отчёт по %s', 'Согласовать бюджет %s', 'Обновить регламент %s',
            'Провести встречу по %s', 'Собрать обратную связь: %s', 'Автоматизировать процесс %s',
            'Проверить метрики %s', 'Обновить документацию: %s', 'Провести аудит %s',
            'Согласовать план %s', 'Проанализировать риски %s', 'Внедрить улучшение: %s',
            'Подготовить презентацию %s', 'Опросить команду: %s', 'Настроить дашборд %s',
            'Ревью кода: %s', 'Актуализировать чек-лист %s', 'Протестировать гипотезу: %s',
            'Спланировать спринт %s', 'Подключить интеграцию %s', 'Разобрать инцидент %s',
            'Согласовать SLA %s', 'Пересобрать процесс %s', 'Написать пост-мортем: %s',
            'Провести 1:1 по %s', 'Согласовать KPI %s', 'Обновить шаблон %s',
            'Организовать демо %s', 'Проверить контрагента %s', 'Оценить эффект от %s',
            'Заказать материалы: %s', 'Синхронизироваться по %s', 'Составить roadmap %s',
            'Ретроспектива %s', 'Собрать требования: %s', 'Провести грумминг %s',
        ];
        $topics = [
            'выручка Q3', 'воронка найма', 'ретеншен клиентов', 'миграция БД', 'релиз v2.4',
            'A/B-тест лендинга', 'обновление офиса', 'корпоратив', 'запуск CRM', 'обучение менеджеров',
            'ISO-сертификация', 'квартальный отчёт', 'план продаж', 'обзор конкурентов', 'API v3',
            'onboarding SDR', 'программа лояльности', 'внутренняя вики', 'ежемесячный NPS', 'пилот с партнёром',
            'бренд-гайд', 'редизайн лендинга', 'внутренние регламенты', 'план развития 2026', 'кросс-функциональная команда',
        ];
        $labelPool = ['срочно', 'клиент', 'внутренний', 'регресс', 'документация', 'blocker', 'improvement', 'discovery'];
        $descPool = [
            'Обсудить с командой и зафиксировать решение.',
            'Требуется согласование с руководителем.',
            'Проверить зависимости с соседними отделами.',
            'Уточнить дедлайны у стейкхолдеров.',
            'Прикрепить артефакты и обновить статус.',
        ];
        $fib = [1, 2, 3, 5, 8, 13];
        $types = ['task','task','task','task','task','task','task','story','story','bug','bug','epic'];
        $urgencies = array_merge(
            array_fill(0, 30, 'low'),
            array_fill(0, 45, 'medium'),
            array_fill(0, 20, 'high'),
            array_fill(0, 5, 'critical'),
        );
        $statusPick = array_merge(
            array_fill(0, 40, 'backlog'),
            array_fill(0, 25, 'in_progress'),
            array_fill(0, 15, 'review'),
            array_fill(0, 20, 'done'),
        );
        $legacyMap = ['backlog' => 'draft', 'in_progress' => 'published', 'review' => 'awaiting_checkin', 'done' => 'done'];

        // спринты по проекту
        $sprintByProject = [];
        foreach ($sprints as $s) $sprintByProject[$s['project_id']] = $s['id'];

        $orderIdx = array_fill_keys($projectIds, 0);
        $batch = [];
        $batchSize = 200;
        $created = 0;

        for ($i = 1; $i <= $count; $i++) {
            $projectId = $projectIds[array_rand($projectIds)];
            $author    = $authors[array_rand($authors)];
            $assignee  = $assignees[array_rand($assignees)];
            $topic     = $topics[array_rand($topics)];
            $title     = sprintf($titles[array_rand($titles)], $topic);
            $stKey     = $statusPick[array_rand($statusPick)];
            $urgency   = $urgencies[array_rand($urgencies)];
            $type      = $types[array_rand($types)];

            $desc = "[{$this->marker}] " . $descPool[array_rand($descPool)];
            if (mt_rand(1, 100) <= 40) $desc .= ' ' . $descPool[array_rand($descPool)];

            $lblCount = mt_rand(0, 3);
            $labels = [];
            $pool = $labelPool;
            shuffle($pool);
            for ($k = 0; $k < $lblCount; $k++) $labels[] = $pool[$k];

            $stStr = $legacyMap[$stKey];
            $isDone = $stKey === 'done';
            $due = now()->addDays(mt_rand(-15, 45));
            $start = now()->subDays(mt_rand(0, 20));

            $row = [
                'id' => (string) Str::uuid(),
                'company_id' => $this->companyId,
                'author_id' => $author,
                'assignee_id' => $assignee,
                'parent_task_id' => null,
                'title' => mb_substr($title, 0, 240),
                'description' => $desc,
                'status' => $stStr,
                'urgency' => $urgency,
                'due_at' => $due,
                'jira_key' => null,
                'completed_at' => $isDone ? now()->subDays(mt_rand(0, 14)) : null,
                'last_notified_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ];
            if ($hasProject)  $row['project_id']  = $projectId;
            if ($hasSprint)   $row['sprint_id']   = (mt_rand(1, 100) <= 60 && isset($sprintByProject[$projectId])) ? $sprintByProject[$projectId] : null;
            if ($hasWorkflow) $row['workflow_id'] = $workflowId;
            if ($hasWfStatus) $row['workflow_status_id'] = $statusIds[$stKey];
            if ($hasType)     $row['type']       = $type;
            if ($hasPriority) $row['priority']   = $urgency;
            if ($hasPoints)   $row['story_points'] = $fib[array_rand($fib)];
            if ($hasEstimate) $row['estimate_minutes'] = mt_rand(60, 1200);
            if ($hasLabels)   $row['labels']     = json_encode($labels, JSON_UNESCAPED_UNICODE);
            if ($hasOrder)    $row['order_index'] = $orderIdx[$projectId]++;
            if ($hasStart)    $row['start_at']   = $start;

            $batch[] = $row;
            if (count($batch) >= $batchSize) {
                DB::table('tracker_tasks')->insert($batch);
                $created += count($batch);
                $batch = [];
            }
        }
        if ($batch) {
            DB::table('tracker_tasks')->insert($batch);
            $created += count($batch);
        }
        return $created;
    }
}
