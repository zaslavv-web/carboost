<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Догоняющий сидинг «последней мили» демо-компании:
 *   - заполненные профили (ФИО, отдел, должность, грейд, аватар для чатов, компетенции);
 *   - воркфлоу трекера и иерархия OKR (компания → отдел → сотрудник) с key results;
 *   - показательный пост в ленте, где задействованы все возможности редактора;
 *   - записи и участники в каждом сообществе.
 *
 * Команда идемпотентна: повторный запуск не создаёт дубликаты.
 */
class SeedDemoExtras extends Command
{
    protected $signature = 'demo:seed-extras
        {--company= : ID или название компании}
        {--email=employee.76@demo.pikrosta.ru : Учётка, профиль которой обязательно должен быть заполнен}';

    protected $description = 'Заполняет профили, OKR, воркфлоу трекера, показательную новость и сообщества демо-компании';

    private string $companyId = '';

    private const DEPARTMENTS = ['Продукт', 'Разработка', 'Маркетинг', 'Продажи', 'Поддержка', 'HR', 'Финансы', 'Операции'];
    private const GRADES = ['junior', 'middle', 'middle+', 'senior', 'lead'];
    private const SKILLS = [
        'Коммуникация', 'Работа в команде', 'Ответственность', 'Аналитика',
        'Клиентоориентированность', 'Планирование', 'Наставничество', 'Адаптивность',
    ];

    public function handle(): int
    {
        $company = $this->resolveCompany();
        if (! $company) {
            $this->error('Компания не найдена. Укажите --company=<id|название>.');
            return self::FAILURE;
        }
        $this->companyId = (string) $company->id;
        $this->info("→ Наполняю компанию «{$company->name}» ({$this->companyId})");

        $filled = $this->fillProfiles();
        $this->line("  профили дозаполнены: {$filled}");

        $skills = $this->fillCompetencies();
        $this->line("  компетенций добавлено: {$skills}");

        $workflow = $this->ensureWorkflow();
        $this->line("  воркфлоу трекера: {$workflow}");

        $okr = $this->ensureOkr();
        $this->line("  целей OKR: {$okr}");

        $benchmarks = $this->ensurePositionBenchmarks();
        $this->line("  эталонов должностей заполнено: {$benchmarks}");

        $absence = $this->ensureAbsences();
        $this->line("  согласованных отсутствий за 6 мес: {$absence}");

        $post = $this->ensureShowcasePost();
        $this->line("  показательная новость: {$post}");

        $community = $this->ensureCommunityContent();
        $this->line("  записей в сообществах: {$community}");

        $pulse = $this->ensurePulseSurveys();
        $this->line("  pulse-опросов и ответов: {$pulse}");

        $onboarding = $this->ensureOnboardingPlans();
        $this->line("  планов адаптации и назначений: {$onboarding}");

        $tests = $this->ensureTestsAndScenarios();
        $this->line("  тестов и сценариев оценки: {$tests}");

        $invites = $this->ensureInvitations();
        $this->line("  приглашений сотрудников: {$invites}");

        $perf = $this->ensurePerformance();
        $this->line("  performance-ревью: {$perf}");

        $docs = $this->ensurePersonalDocuments();
        $this->line("  персональных документов: {$docs}");




        $this->verify();

        $this->info('✅ Догоняющий контент готов.');
        return self::SUCCESS;
    }

    private function resolveCompany(): ?object
    {
        $explicit = trim((string) $this->option('company'));
        if ($explicit !== '') {
            return DB::table('companies')->where('id', $explicit)->orWhere('name', $explicit)->first();
        }

        $email = (string) $this->option('email');
        $companyId = DB::table('users')
            ->join('profiles', 'profiles.user_id', '=', 'users.id')
            ->where('users.email', $email)
            ->value('profiles.company_id');

        if (! $companyId) {
            $companyId = DB::table('users')
                ->join('profiles', 'profiles.user_id', '=', 'users.id')
                ->where('users.email', 'like', '%@demo.%')
                ->whereNotNull('profiles.company_id')
                ->value('profiles.company_id');
        }

        // Финальный фолбэк: самая населённая компания стенда. Без него команда
        // падала на любом окружении, где демо-учётки называются иначе
        // (например, demo_doom), хотя данные для наполнения есть.
        if (! $companyId) {
            $companyId = DB::table('profiles')
                ->whereNotNull('company_id')
                ->select('company_id', DB::raw('COUNT(*) as cnt'))
                ->groupBy('company_id')
                ->orderByDesc('cnt')
                ->value('company_id');
            if ($companyId) {
                $name = DB::table('companies')->where('id', $companyId)->value('name');
                $this->warn("Компания не задана — беру самую населённую: «{$name}». Для другой укажите --company=<id|название>.");
            }
        }

        if (! $companyId) {
            $available = DB::table('companies')->orderBy('name')->limit(20)->pluck('name')->all();
            if ($available) $this->line('Доступные компании: ' . implode(', ', $available));
        }

        return $companyId ? DB::table('companies')->where('id', $companyId)->first() : null;
    }


    /** Дозаполняет пустые поля профилей: ФИО, отдел, должность, грейд, аватар, даты. */
    private function fillProfiles(): int
    {
        $positions = DB::table('positions')->where('company_id', $this->companyId)->pluck('title', 'id')->all();
        $positionIds = array_keys($positions);
        $hasGrade = Schema::hasColumn('profiles', 'grade');
        $updated = 0;

        $rows = DB::table('profiles')
            ->join('users', 'users.id', '=', 'profiles.user_id')
            ->where('profiles.company_id', $this->companyId)
            ->select('profiles.*', 'users.email')
            ->get();

        foreach ($rows as $i => $row) {
            $patch = [];
            if (trim((string) $row->full_name) === '') {
                $patch['full_name'] = 'Сотрудник ' . ($i + 1);
            }
            if (trim((string) ($row->department ?? '')) === '') {
                $patch['department'] = self::DEPARTMENTS[$i % count(self::DEPARTMENTS)];
            }
            if (Schema::hasColumn('profiles', 'position') && trim((string) ($row->position ?? '')) === '' && $positionIds) {
                $patch['position'] = $positions[$positionIds[$i % count($positionIds)]];
            }
            if (empty($row->position_id) && $positionIds) {
                $patch['position_id'] = $positionIds[$i % count($positionIds)];
            }
            if ($hasGrade && trim((string) ($row->grade ?? '')) === '') {
                $patch['grade'] = self::GRADES[$i % count(self::GRADES)];
            }
            if (Schema::hasColumn('profiles', 'hire_date') && empty($row->hire_date)) {
                $patch['hire_date'] = now()->subDays(200 + ($i * 7) % 1200)->toDateString();
            }
            if (Schema::hasColumn('profiles', 'overall_score') && (int) ($row->overall_score ?? 0) === 0) {
                $patch['overall_score'] = 60 + (($i * 7) % 35);
            }
            if (Schema::hasColumn('profiles', 'role_readiness') && (int) ($row->role_readiness ?? 0) === 0) {
                $patch['role_readiness'] = 45 + (($i * 11) % 50);
            }
            if (trim((string) ($row->avatar_url ?? '')) === '') {
                // Детерминированный аватар: одинаковый и в профиле, и в чатах.
                $seed = rawurlencode((string) $row->email);
                $patch['avatar_url'] = "https://api.dicebear.com/9.x/initials/svg?seed={$seed}&backgroundType=gradientLinear&radius=50";
            }

            if ($patch) {
                $patch['updated_at'] = now();
                DB::table('profiles')->where('id', $row->id)->update($patch);
                $updated++;
            }
        }

        return $updated;
    }

    /**
     * Компетенции сотрудников. Догоняем не только пустые профили, но и
     * частично заполненные: у каждого сотрудника должна быть оценка по всем
     * навыкам эталона, иначе сравнение «сотрудник vs эталон» показывает
     * однобокие строки и бессмысленные проценты.
     */
    private function fillCompetencies(): int
    {
        if (! Schema::hasTable('competencies')) return 0;

        $userIds = DB::table('profiles')->where('company_id', $this->companyId)->pluck('user_id')->all();
        if (! $userIds) return 0;

        $existing = [];
        DB::table('competencies')->where('company_id', $this->companyId)
            ->select('user_id', 'skill_name')
            ->orderBy('user_id')
            ->chunk(2000, function ($rows) use (&$existing) {
                foreach ($rows as $row) $existing[(string) $row->user_id][(string) $row->skill_name] = true;
            });

        $created = 0;
        foreach ($userIds as $i => $userId) {
            $have = $existing[(string) $userId] ?? [];
            $rows = [];
            foreach (self::SKILLS as $k => $skill) {
                if (isset($have[$skill])) continue;
                $rows[] = [
                    'id' => (string) Str::uuid(),
                    'user_id' => $userId,
                    'company_id' => $this->companyId,
                    'skill_name' => $skill,
                    'skill_value' => 2 + (($i + $k) % 4),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
            if (! $rows) continue;
            DB::table('competencies')->insert($rows);
            $created += count($rows);
        }

        return $created;
    }


    /** Воркфлоу по умолчанию + привязка проектов и задач к его статусам. */
    private function ensureWorkflow(): string
    {
        if (! Schema::hasTable('tracker_workflows')) return 'таблиц нет';

        $workflow = DB::table('tracker_workflows')->where('company_id', $this->companyId)->first();
        if (! $workflow) {
            $workflowId = (string) Str::uuid();
            DB::table('tracker_workflows')->insert([
                'id' => $workflowId,
                'company_id' => $this->companyId,
                'name' => 'Базовый процесс',
                'description' => 'Бэклог → В работе → Ревью → Готово',
                'is_default' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $workflowId = (string) $workflow->id;
        }

        $statuses = [
            ['key' => 'backlog', 'name' => 'Бэклог', 'category' => 'todo', 'color' => '#94a3b8', 'is_initial' => true],
            ['key' => 'in_progress', 'name' => 'В работе', 'category' => 'in_progress', 'color' => '#3b82f6', 'is_initial' => false],
            ['key' => 'review', 'name' => 'На проверке', 'category' => 'in_progress', 'color' => '#f59e0b', 'is_initial' => false],
            ['key' => 'done', 'name' => 'Готово', 'category' => 'done', 'color' => '#22c55e', 'is_initial' => false],
        ];
        $statusIds = [];
        foreach ($statuses as $position => $status) {
            $existing = DB::table('tracker_workflow_statuses')
                ->where('workflow_id', $workflowId)->where('key', $status['key'])->first();
            if ($existing) {
                $statusIds[$status['key']] = (string) $existing->id;
                continue;
            }
            $id = (string) Str::uuid();
            DB::table('tracker_workflow_statuses')->insert([
                'id' => $id,
                'workflow_id' => $workflowId,
                'company_id' => $this->companyId,
                'key' => $status['key'],
                'name' => $status['name'],
                'category' => $status['category'],
                'color' => $status['color'],
                'position' => $position,
                'is_initial' => $status['is_initial'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $statusIds[$status['key']] = $id;
        }

        if (Schema::hasTable('tracker_workflow_transitions')) {
            $order = ['backlog', 'in_progress', 'review', 'done'];
            foreach ($order as $index => $key) {
                foreach ($order as $targetKey) {
                    if ($key === $targetKey) continue;
                    $exists = DB::table('tracker_workflow_transitions')
                        ->where('workflow_id', $workflowId)
                        ->where('from_status_id', $statusIds[$key])
                        ->where('to_status_id', $statusIds[$targetKey])
                        ->exists();
                    if ($exists) continue;
                    DB::table('tracker_workflow_transitions')->insert([
                        'id' => (string) Str::uuid(),
                        'workflow_id' => $workflowId,
                        'company_id' => $this->companyId,
                        'from_status_id' => $statusIds[$key],
                        'to_status_id' => $statusIds[$targetKey],
                        'name' => 'В «' . $statuses[array_search($targetKey, $order, true)]['name'] . '»',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                unset($index);
            }
        }

        if (Schema::hasColumn('tracker_projects', 'workflow_id')) {
            DB::table('tracker_projects')->where('company_id', $this->companyId)
                ->whereNull('workflow_id')->update(['workflow_id' => $workflowId]);
        }

        if (Schema::hasColumn('tracker_tasks', 'workflow_status_id')) {
            $map = [
                'draft' => 'backlog', 'published' => 'backlog', 'orphan' => 'backlog',
                'awaiting_checkin' => 'in_progress', 'needs_attention' => 'review',
                'done' => 'done', 'archived' => 'done',
            ];
            foreach ($map as $taskStatus => $statusKey) {
                DB::table('tracker_tasks')->where('company_id', $this->companyId)
                    ->where('status', $taskStatus)->whereNull('workflow_status_id')
                    ->update(['workflow_status_id' => $statusIds[$statusKey]]);
            }
            DB::table('tracker_tasks')->where('company_id', $this->companyId)
                ->whereNull('workflow_status_id')->update(['workflow_status_id' => $statusIds['backlog']]);
        }

        return 'ok (' . count($statusIds) . ' статусов)';
    }

    /** Иерархия OKR: цель компании → цели отделов → личные цели с key results. */
    private function ensureOkr(): int
    {
        if (! Schema::hasTable('tracker_goals')) return 0;

        $periodId = null;
        if (Schema::hasTable('tracker_okr_periods')) {
            $period = DB::table('tracker_okr_periods')->where('company_id', $this->companyId)->where('is_active', true)->first();
            if (! $period) {
                $periodId = (string) Str::uuid();
                DB::table('tracker_okr_periods')->insert([
                    'id' => $periodId,
                    'company_id' => $this->companyId,
                    'name' => 'Квартал ' . now()->quarter . ' / ' . now()->year,
                    'kind' => 'quarter',
                    'starts_at' => now()->startOfQuarter()->toDateString(),
                    'ends_at' => now()->endOfQuarter()->toDateString(),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } else {
                $periodId = (string) $period->id;
            }
        }

        $profiles = DB::table('profiles')->where('company_id', $this->companyId)
            ->select('user_id', 'department', 'full_name')->get();
        if ($profiles->isEmpty()) return 0;

        $owner = (string) $profiles->first()->user_id;
        $created = 0;

        $companyGoal = DB::table('tracker_goals')->where('company_id', $this->companyId)
            ->where('title', 'Вырасти в выручке на 30% за квартал')->first();
        if (! $companyGoal) {
            $companyGoalId = $this->insertGoal($periodId, $owner, null, 'Вырасти в выручке на 30% за квартал',
                'Стратегическая цель компании на квартал: рост выручки, удержание команды и качество сервиса.', 42, 'company', null, null);
            $created++;
            $this->insertKeyResults($companyGoalId, [
                ['Выручка, млн ₽', 'млн ₽', 120, 156, 132],
                ['Удержание сотрудников, %', '%', 88, 94, 91],
                ['NPS клиентов', 'пункты', 41, 55, 47],
            ]);
        } else {
            $companyGoalId = (string) $companyGoal->id;
            $this->backfillGoalScope($companyGoalId, 'company', null, null);
        }

        $byDepartment = $profiles->groupBy(fn ($p) => $p->department ?: 'Без отдела');
        foreach ($byDepartment as $department => $members) {
            $holder = (string) $members->first()->user_id;
            $title = "{$department}: выполнить квартальный план";
            $deptGoal = DB::table('tracker_goals')->where('company_id', $this->companyId)->where('title', $title)->first();
            if (! $deptGoal) {
                $deptGoalId = $this->insertGoal($periodId, $holder, $companyGoalId, $title,
                    "Цель отдела «{$department}» — вклад в стратегическую цель компании.", 55, 'department', $holder, (string) $department);
                $created++;
                $this->insertKeyResults($deptGoalId, [
                    ['Выполнение плана отдела, %', '%', 0, 100, 58],
                    ['Закрытые инициативы', 'шт', 0, 8, 5],
                ]);
            } else {
                $deptGoalId = (string) $deptGoal->id;
                $this->backfillGoalScope($deptGoalId, 'department', $holder, (string) $department);
            }

            // Цель нужна каждому сотруднику отдела. Лимит в 40 оставлял
            // employee.76 и остальных сотрудников больших отделов без OKR.
            foreach ($members as $index => $member) {
                $holderId = (string) $member->user_id;
                $personal = DB::table('tracker_goals')->where('company_id', $this->companyId)
                    ->where('holder_id', $holderId)->whereNotNull('parent_goal_id')->exists();
                if ($personal) continue;

                $goalId = $this->insertGoal($periodId, $holderId, $deptGoalId,
                    'Личная цель: повысить качество результата на своём участке',
                    'Индивидуальная цель на квартал, связана с целью отдела.', 30 + (($index * 13) % 60), 'employee', $holderId, (string) $member->full_name);
                $created++;
                $this->insertKeyResults($goalId, [
                    ['Закрытые задачи в срок, %', '%', 60, 90, 72 + ($index % 10)],
                    ['Пройденные курсы', 'шт', 0, 3, 1 + ($index % 3)],
                ]);
            }
        }

        return $created;
    }

    private function insertGoal(?string $periodId, string $holderId, ?string $parentId, string $title, string $description, float $progress, string $scopeType = 'employee', ?string $scopeRef = null, ?string $scopeLabel = null): string
    {
        $id = (string) Str::uuid();
        $payload = [
            'id' => $id,
            'company_id' => $this->companyId,
            'period_id' => $periodId,
            'holder_id' => $holderId,
            'author_id' => $holderId,
            'parent_goal_id' => $parentId,
            'title' => $title,
            'description' => $description,
            'status' => 'published',
            'progress' => $progress,
            'published_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ];
        if (Schema::hasColumn('tracker_goals', 'scope_type')) $payload['scope_type'] = $scopeType;
        if (Schema::hasColumn('tracker_goals', 'scope_ref')) $payload['scope_ref'] = $scopeRef;
        if (Schema::hasColumn('tracker_goals', 'scope_label')) $payload['scope_label'] = $scopeLabel;
        DB::table('tracker_goals')->insert($payload);

        return $id;
    }

    private function backfillGoalScope(string $goalId, string $scopeType, ?string $scopeRef, ?string $scopeLabel): void
    {
        $patch = ['updated_at' => now()];
        if (Schema::hasColumn('tracker_goals', 'scope_type')) $patch['scope_type'] = $scopeType;
        if (Schema::hasColumn('tracker_goals', 'scope_ref')) $patch['scope_ref'] = $scopeRef;
        if (Schema::hasColumn('tracker_goals', 'scope_label')) $patch['scope_label'] = $scopeLabel;
        DB::table('tracker_goals')->where('id', $goalId)->update($patch);
    }

    /** @param array<int, array{0:string,1:string,2:float,3:float,4:float}> $rows */
    private function insertKeyResults(string $goalId, array $rows): void
    {
        if (! Schema::hasTable('tracker_key_results')) return;

        $payload = [];
        foreach ($rows as $position => [$title, $unit, $start, $target, $current]) {
            $payload[] = [
                'id' => (string) Str::uuid(),
                'goal_id' => $goalId,
                'title' => $title,
                'unit' => $unit,
                'weight' => 1,
                'start_value' => $start,
                'target_value' => $target,
                'current_value' => $current,
                'position' => $position,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        DB::table('tracker_key_results')->insert($payload);
    }

    /**
     * Эталонные профили компетенций у должностей.
     * Без них сравнение «сотрудник ↔ должность» бессмысленно и раньше давало
     * проценты в тысячах (делили сумму факта на почти нулевой эталон).
     */
    private function ensurePositionBenchmarks(): int
    {
        if (! Schema::hasTable('positions') || ! Schema::hasColumn('positions', 'competency_profile')) return 0;

        $positions = DB::table('positions')->where('company_id', $this->companyId)->get(['id', 'title', 'competency_profile']);
        $filled = 0;

        foreach ($positions as $i => $position) {
            $existing = $position->competency_profile;
            if (is_string($existing)) {
                $decoded = json_decode($existing, true);
            } else {
                $decoded = $existing;
            }
            $valid = is_array($decoded) && count(array_filter($decoded, fn ($row) => (float) ($row['required_level'] ?? 0) > 0)) > 0;
            if ($valid) continue;

            $profile = [];
            foreach (self::SKILLS as $k => $skill) {
                $required = 3 + (($i + $k) % 3); // 3..5 по той же шкале, что и competencies
                $profile[] = [
                    'name' => $skill,
                    'skill' => $skill,
                    'required_level' => $required,
                    'weight' => 1,
                ];
            }
            DB::table('positions')->where('id', $position->id)->update([
                'competency_profile' => json_encode($profile, JSON_UNESCAPED_UNICODE),
                'updated_at' => now(),
            ]);
            $filled++;
        }

        return $filled;
    }

    /**
     * Отсутствия за последние 6 месяцев: график «Доля отсутствий» строится
     * по approved-заявкам в окне 6 месяцев, поэтому в каждом месяце должна
     * быть хотя бы одна согласованная заявка.
     */
    private function ensureAbsences(): int
    {
        if (! Schema::hasTable('leave_requests') || ! Schema::hasTable('leave_types')) return 0;

        $profiles = DB::table('profiles')->where('company_id', $this->companyId)
            ->get(['user_id', 'department']);
        if ($profiles->isEmpty()) return 0;

        $types = [
            ['annual', 'Ежегодный отпуск', true, 28, false],
            ['sick', 'Больничный', true, 0, true],
            ['unpaid', 'Отпуск за свой счёт', false, 0, false],
        ];
        $typeIds = [];
        foreach ($types as [$code, $title, $paid, $accrual, $cert]) {
            $existing = DB::table('leave_types')->where('company_id', $this->companyId)->where('code', $code)->first();
            $id = $existing->id ?? (string) Str::uuid();
            DB::table('leave_types')->updateOrInsert(
                ['company_id' => $this->companyId, 'code' => $code],
                [
                    'id' => $id, 'title' => $title, 'paid' => $paid, 'accrual_days_per_year' => $accrual,
                    'requires_medical_cert' => $cert, 'is_active' => true,
                    'created_at' => now(), 'updated_at' => now(),
                ],
            );
            $typeIds[$code] = (string) $id;
        }

        $userIds = $profiles->pluck('user_id')->all();
        $codes = array_keys($typeIds);
        $created = 0;

        for ($m = 5; $m >= 0; $m--) {
            $monthStart = now()->startOfMonth()->subMonths($m);
            $monthEnd = $monthStart->copy()->endOfMonth();

            $approved = DB::table('leave_requests')
                ->where('company_id', $this->companyId)
                ->where('status', 'approved')
                ->whereBetween('start_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
                ->count();
            if ($approved < 3) {
                for ($k = $approved; $k < 3; $k++) {
                    $userId = $userIds[($m * 3 + $k) % count($userIds)];
                    $code = $codes[($m + $k) % count($codes)];
                    $start = $monthStart->copy()->addDays(3 + (($m + $k) * 4) % 20);
                    if ($start->greaterThan($monthEnd)) $start = $monthEnd->copy()->subDays(2);
                    $days = 2 + (($m + $k) % 5);

                    DB::table('leave_requests')->insert([
                        'id' => (string) Str::uuid(),
                        'company_id' => $this->companyId,
                        'user_id' => $userId,
                        'leave_type_id' => $typeIds[$code],
                        'start_date' => $start->toDateString(),
                        'end_date' => $start->copy()->addDays($days - 1)->toDateString(),
                        'days_count' => $days,
                        'reason' => $code === 'sick' ? 'Больничный лист' : 'Плановый отдых',
                        'status' => 'approved',
                        'manager_decision_at' => $start->copy()->subDays(3),
                        'manager_comment' => 'Согласовано',
                        'hr_decision_at' => $start->copy()->subDays(2),
                        'hr_comment' => 'Учтено в календаре команды',
                        'paid_days' => $code === 'unpaid' ? 0 : $days,
                        'unpaid_days' => $code === 'unpaid' ? $days : 0,
                        'created_at' => $start->copy()->subDays(5),
                        'updated_at' => now(),
                    ]);
                    $created++;
                }
            }
        }

        // Вкладка «Входящие» показывает pending_manager/pending_hr. Создаём
        // демонстрационные заявки на согласовании отдельно от approved-графика.
        foreach (['pending_manager', 'pending_hr'] as $i => $status) {
            $exists = DB::table('leave_requests')
                ->where('company_id', $this->companyId)
                ->where('status', $status)
                ->exists();
            if ($exists) continue;
            $userId = $userIds[$i % count($userIds)];
            $start = now()->addDays(7 + $i * 5);
            DB::table('leave_requests')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $this->companyId,
                'user_id' => $userId,
                'leave_type_id' => $typeIds[$i === 0 ? 'annual' : 'sick'],
                'start_date' => $start->toDateString(),
                'end_date' => $start->copy()->addDays(2 + $i)->toDateString(),
                'days_count' => 3 + $i,
                'reason' => $i === 0 ? 'Семейные обстоятельства' : 'Плановое обследование',
                'status' => $status,
                'manager_decision_at' => $status === 'pending_hr' ? now()->subDay() : null,
                'manager_comment' => $status === 'pending_hr' ? 'Руководитель согласовал' : null,
                'paid_days' => 3 + $i,
                'unpaid_days' => 0,
                'created_at' => now()->subDays(2 + $i),
                'updated_at' => now(),
            ]);
            $created++;
        }

        return $created;
    }

    /** Пост-образец: заголовки, списки, изображения, видео, ссылка и вложения. */
    private function ensureShowcasePost(): string
    {
        if (! Schema::hasTable('portal_posts')) return 'таблицы нет';

        $title = 'Как оформить новость: гид по возможностям редактора';
        $existing = DB::table('portal_posts')->where('company_id', $this->companyId)->where('title', $title)->first();

        $body = <<<'HTML'
<h2>Корпоратив «Пик роста» — 12 декабря</h2>
<p>Публикация-образец: здесь собраны <strong>все возможности редактора</strong> — заголовки, подзаголовки,
<em>курсив</em>, <u>подчёркивание</u>, списки, изображения, видео, ссылки и вложения.</p>
<h3>Программа вечера</h3>
<ul><li>18:00 — сбор гостей и welcome-зона</li><li>19:00 — итоги года и награждение</li><li>20:30 — фуршет и живая музыка</li><li>22:00 — фотозона и афтерпати</li></ul>
<h3>Что нужно сделать заранее</h3>
<ol><li>Подтвердить участие до 5 декабря</li><li>Указать пожелания по питанию</li><li>Скачать программу из вложений</li></ol>
<p><img src="/demo/corporate-event.jpg" alt="Команда на корпоративном мероприятии"></p>
<h3>Видео с прошлого года</h3>
<video src="/demo/corporate-event.mp4" controls preload="metadata"></video>
<p>Подробности — на <a href="https://growth-peak.pro" target="_blank" rel="noopener noreferrer">внутреннем портале</a>.
Вопросы задавайте HR-команде в комментариях: мы отвечаем в течение рабочего дня.</p>
<blockquote>Совет: используйте «Заголовок» для смысловых блоков и «Подзаголовок» для деталей — так новость легче читать с телефона.</blockquote>
HTML;

        $attachments = [
            ['name' => 'Программа корпоратива.pdf', 'url' => '/demo/corporate-program.pdf'],
            ['name' => 'Фотография команды.jpg', 'url' => '/demo/corporate-event.jpg'],
        ];

        $author = DB::table('profiles')->where('company_id', $this->companyId)->value('user_id');
        $payload = [
            'company_id' => $this->companyId,
            'author_id' => $author,
            'kind' => 'announcement',
            'title' => $title,
            'body_md' => $body,
            'is_pinned' => true,
            'published_at' => now(),
            'updated_at' => now(),
        ];
        if (Schema::hasColumn('portal_posts', 'attachments')) {
            $payload['attachments'] = json_encode($attachments, JSON_UNESCAPED_UNICODE);
        }

        if ($existing) {
            DB::table('portal_posts')->where('id', $existing->id)->update($payload);
            return 'обновлена';
        }

        DB::table('portal_posts')->insert($payload + [
            'id' => (string) Str::uuid(),
            'created_at' => now(),
        ]);

        return 'создана';
    }

    /** В каждом сообществе — участники и минимум три записи. */
    private function ensureCommunityContent(): int
    {
        if (! Schema::hasTable('portal_communities')) return 0;

        $communities = DB::table('portal_communities')->where('company_id', $this->companyId)->get();
        $userIds = DB::table('profiles')->where('company_id', $this->companyId)->pluck('user_id')->all();
        if ($communities->isEmpty() || ! $userIds) return 0;

        $created = 0;
        foreach ($communities as $ci => $community) {
            // Участники
            if (Schema::hasTable('portal_community_members')) {
                $slice = array_slice($userIds, ($ci * 7) % max(1, count($userIds)), 14);
                foreach ($slice as $userId) {
                    $exists = DB::table('portal_community_members')
                        ->where('community_id', $community->id)->where('user_id', $userId)->exists();
                    if ($exists) continue;
                    DB::table('portal_community_members')->insert([
                        'id' => (string) Str::uuid(),
                        'company_id' => $this->companyId,
                        'community_id' => $community->id,
                        'user_id' => $userId,
                        'role' => 'member',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                DB::table('portal_communities')->where('id', $community->id)->update([
                    'members_count' => DB::table('portal_community_members')->where('community_id', $community->id)->count(),
                    'updated_at' => now(),
                ]);
            }

            $posts = DB::table('portal_posts')->where('community_id', $community->id)->count();
            if ($posts >= 3) continue;

            $templates = [
                ['post', "Правила сообщества «{$community->title}»", '<h3>О чём это сообщество</h3><p>Делимся практикой, задаём вопросы и помогаем друг другу. Публикации без рекламы и спама.</p><ul><li>Уважаем время коллег</li><li>Пишем по делу</li><li>Помогаем новичкам</li></ul>'],
                ['announcement', 'Встреча сообщества на этой неделе', '<p>В четверг в 17:00 собираемся онлайн: разбираем кейсы участников и планируем следующие темы.</p><p><img src="/demo/community-cover.jpg" alt="Встреча сообщества"></p>'],
                ['event', 'Открытый воркшоп для всех желающих', '<h3>Что будет</h3><p>Практика в мини-группах и разбор ошибок. Регистрация — в комментариях.</p>'],
            ];
            foreach (array_slice($templates, $posts) as $index => [$kind, $postTitle, $postBody]) {
                DB::table('portal_posts')->insert([
                    'id' => (string) Str::uuid(),
                    'company_id' => $this->companyId,
                    'author_id' => $userIds[($ci + $index) % count($userIds)],
                    'community_id' => $community->id,
                    'kind' => $kind,
                    'title' => $postTitle,
                    'body_md' => $postBody,
                    'is_pinned' => false,
                    'published_at' => now()->subDays($index + 1),
                    'created_at' => now()->subDays($index + 1),
                    'updated_at' => now(),
                ]);
                $created++;
            }
        }

        return $created;
    }

    /** Pulse-опросы: активные анкеты, вопросы, ответы и таргетинг по отделам. */
    private function ensurePulseSurveys(): int
    {
        if (! Schema::hasTable('pulse_surveys') || ! Schema::hasTable('pulse_survey_questions')) return 0;
        $admin = $this->adminUserId();
        if (! $admin) return 0;

        $profiles = DB::table('profiles')->where('company_id', $this->companyId)
            ->limit(60)->get(['user_id', 'department']);
        if ($profiles->isEmpty()) return 0;

        $blueprints = [
            [
                'title' => 'Еженедельный пульс команды',
                'description' => 'Короткий замер нагрузки, фокуса и настроения сотрудников.',
                'is_anonymous' => true,
                'questions' => [
                    ['scale', 'Насколько комфортна текущая нагрузка?', null],
                    ['nps', 'Насколько вы готовы рекомендовать команду как место работы?', null],
                    ['text', 'Что поможет работать лучше на этой неделе?', null],
                ],
            ],
            [
                'title' => 'Опрос после запуска продукта',
                'description' => 'Небольшой ретро-опрос по взаимодействию между отделами.',
                'is_anonymous' => false,
                'questions' => [
                    ['single', 'Как вы оцениваете качество коммуникации?', ['Отлично', 'Хорошо', 'Требует улучшения']],
                    ['scale', 'Насколько понятны приоритеты на следующий спринт?', null],
                    ['text', 'Какие блокеры нужно снять?', null],
                ],
            ],
        ];

        $created = 0;
        foreach ($blueprints as $bi => $survey) {
            $row = DB::table('pulse_surveys')->where('company_id', $this->companyId)->where('title', $survey['title'])->first();
            $surveyId = $row->id ?? (string) Str::uuid();
            $payload = [
                'company_id' => $this->companyId,
                'created_by' => $admin,
                'title' => $survey['title'],
                'description' => $survey['description'],
                'audience' => 'company',
                'is_anonymous' => $survey['is_anonymous'],
                'status' => 'running',
                'starts_at' => now()->subDays(7 + $bi),
                'ends_at' => now()->addDays(14 + $bi),
                'updated_at' => now(),
            ];
            if ($row) {
                DB::table('pulse_surveys')->where('id', $surveyId)->update($payload);
            } else {
                DB::table('pulse_surveys')->insert($payload + ['id' => $surveyId, 'created_at' => now()->subDays(8 + $bi)]);
                $created++;
            }

            foreach ($survey['questions'] as $qi => [$kind, $title, $options]) {
                $q = DB::table('pulse_survey_questions')->where('survey_id', $surveyId)->where('title', $title)->first();
                $questionId = $q->id ?? (string) Str::uuid();
                $qPayload = [
                    'company_id' => $this->companyId,
                    'survey_id' => $surveyId,
                    'order_index' => $qi,
                    'kind' => $kind,
                    'title' => $title,
                    'options' => $options ? json_encode($options, JSON_UNESCAPED_UNICODE) : null,
                    'is_required' => true,
                    'updated_at' => now(),
                ];
                if ($q) {
                    DB::table('pulse_survey_questions')->where('id', $questionId)->update($qPayload);
                } else {
                    DB::table('pulse_survey_questions')->insert($qPayload + ['id' => $questionId, 'created_at' => now()->subDays(8 + $bi)]);
                    $created++;
                }

                if (Schema::hasTable('pulse_survey_responses')) {
                    $existingResponses = DB::table('pulse_survey_responses')->where('question_id', $questionId)->count();
                    if ($existingResponses < 12) {
                        $rows = [];
                        foreach ($profiles->take(18) as $ri => $profile) {
                            $valueNumber = null;
                            $valueText = null;
                            if ($kind === 'nps') $valueNumber = 6 + (($ri + $qi) % 5);
                            elseif ($kind === 'scale') $valueNumber = 3 + (($ri + $qi) % 3);
                            elseif ($kind === 'single') $valueText = $options[($ri + $qi) % count($options)];
                            else $valueText = ['Нужно меньше переключений между задачами', 'Помог бы общий план на неделю', 'Команда хорошо синхронизировалась'][$ri % 3];
                            $rows[] = [
                                'id' => (string) Str::uuid(),
                                'company_id' => $this->companyId,
                                'survey_id' => $surveyId,
                                'question_id' => $questionId,
                                'user_id' => $survey['is_anonymous'] ? null : $profile->user_id,
                                'value_number' => $valueNumber,
                                'value_text' => $valueText,
                                'value_json' => null,
                                'created_at' => now()->subDays(($ri % 5) + 1),
                                'updated_at' => now(),
                            ];
                        }
                        if ($rows) DB::table('pulse_survey_responses')->insert($rows);
                        $created += count($rows);
                    }
                }
            }

            if (Schema::hasTable('pulse_survey_targets')) {
                $department = $profiles->pluck('department')->filter()->unique()->values()->get($bi);
                if ($department && Schema::hasTable('departments')) {
                    $departmentId = DB::table('departments')->where('company_id', $this->companyId)->where('name', $department)->value('id');
                    if ($departmentId) {
                        DB::table('pulse_survey_targets')->updateOrInsert(
                            ['survey_id' => $surveyId, 'target_type' => 'department', 'target_ref' => $departmentId],
                            ['id' => (string) Str::uuid(), 'company_id' => $this->companyId, 'created_at' => now(), 'updated_at' => now()]
                        );
                    }
                }
            }
        }

        return $created;
    }

    /** Планы адаптации: шаблоны, шаги, назначения и прогресс. */
    private function ensureOnboardingPlans(): int
    {
        if (! Schema::hasTable('onboarding_plans') || ! Schema::hasTable('onboarding_plan_steps') || ! Schema::hasTable('onboarding_assignments')) return 0;
        $admin = $this->adminUserId();
        if (! $admin) return 0;

        $profiles = DB::table('profiles')->where('company_id', $this->companyId)
            ->orderBy('created_at')->limit(40)->get(['user_id', 'full_name', 'requested_role']);
        if ($profiles->isEmpty()) return 0;

        $created = 0;
        $planTitle = '90 дней: уверенный старт сотрудника';
        $plan = DB::table('onboarding_plans')->where('company_id', $this->companyId)->where('title', $planTitle)->first();
        $planId = $plan->id ?? (string) Str::uuid();
        $planPayload = [
            'company_id' => $this->companyId,
            'created_by' => $admin,
            'title' => $planTitle,
            'description' => 'Готовый демо-план адаптации: документы, доступы, встречи, обучение и чек-листы.',
            'target_role' => 'employee',
            'duration_days' => 90,
            'is_active' => true,
            'auto_assign' => true,
            'updated_at' => now(),
        ];
        if ($plan) DB::table('onboarding_plans')->where('id', $planId)->update($planPayload);
        else {
            DB::table('onboarding_plans')->insert($planPayload + ['id' => $planId, 'created_at' => now()->subDays(30)]);
            $created++;
        }

        $steps = [
            ['Подписать пакет документов', 'document', 'hr', 'pre_day1', 0, '/demo/corporate-program.pdf', 'Трудовой договор, NDA и согласия в КЭДО.'],
            ['Получить доступы к рабочим системам', 'access', 'manager', 'first_day', 1, null, 'Почта, трекер, база знаний и корпоративный мессенджер.'],
            ['Встреча с бадди', 'meeting', 'buddy', 'first_week', 3, null, 'Разобрать карту команды, договориться о формате поддержки.'],
            ['Пройти вводный курс по стандартам', 'training', 'employee', 'first_week', 7, '/courses', 'Короткий курс и закрытый тест по корпоративным правилам.'],
            ['Первый чек-ин по целям', 'checklist', 'manager', 'first_month', 21, '/tracker/goals', 'Согласовать личные OKR и критерии успешной адаптации.'],
            ['Итог probation review', 'meeting', 'manager', 'probation', 75, '/performance', 'Финальная встреча по результатам испытательного срока.'],
        ];
        $stepIds = [];
        foreach ($steps as $i => [$title, $type, $responsible, $stage, $due, $url, $description]) {
            $step = DB::table('onboarding_plan_steps')->where('plan_id', $planId)->where('title', $title)->first();
            $stepId = $step->id ?? (string) Str::uuid();
            $payload = [
                'company_id' => $this->companyId,
                'plan_id' => $planId,
                'title' => $title,
                'description' => $description,
                'step_type' => $type,
                'responsible' => $responsible,
                'stage' => $stage,
                'order_index' => $i,
                'due_offset_days' => $due,
                'material_url' => $url,
                'is_required' => true,
                'updated_at' => now(),
            ];
            if ($step) DB::table('onboarding_plan_steps')->where('id', $stepId)->update($payload);
            else {
                DB::table('onboarding_plan_steps')->insert($payload + ['id' => $stepId, 'created_at' => now()->subDays(30)]);
                $created++;
            }
            $stepIds[] = $stepId;
        }

        foreach ($profiles->take(12) as $i => $profile) {
            $assignment = DB::table('onboarding_assignments')->where('company_id', $this->companyId)->where('user_id', $profile->user_id)->first();
            $assignmentId = $assignment->id ?? (string) Str::uuid();
            $start = now()->subDays(($i * 4) % 50)->toDateString();
            $progress = 20 + (($i * 9) % 70);
            $payload = [
                'company_id' => $this->companyId,
                'user_id' => $profile->user_id,
                'plan_id' => $planId,
                'manager_id' => $admin,
                'buddy_id' => $profiles->get(($i + 1) % $profiles->count())->user_id,
                'hr_id' => $admin,
                'start_date' => $start,
                'expected_end_date' => now()->parse($start)->addDays(90)->toDateString(),
                'status' => $progress >= 90 ? 'completed' : 'in_progress',
                'current_stage' => $progress < 35 ? 'first_week' : ($progress < 70 ? 'first_month' : 'probation'),
                'progress_percent' => $progress,
                'notes' => 'Демо-назначение адаптационного плана.',
                'updated_at' => now(),
            ];
            if ($assignment) DB::table('onboarding_assignments')->where('id', $assignmentId)->update($payload);
            else {
                DB::table('onboarding_assignments')->insert($payload + ['id' => $assignmentId, 'created_at' => now()->subDays(20)]);
                $created++;
            }

            if (Schema::hasTable('onboarding_step_progress')) {
                foreach ($stepIds as $si => $stepId) {
                    $status = $si * 16 < $progress ? 'done' : ($si * 14 < $progress ? 'in_progress' : 'pending');
                    DB::table('onboarding_step_progress')->updateOrInsert(
                        ['assignment_id' => $assignmentId, 'step_id' => $stepId],
                        [
                            'id' => (string) Str::uuid(),
                            'company_id' => $this->companyId,
                            'status' => $status,
                            'completed_at' => $status === 'done' ? now()->subDays(max(1, 15 - $si))->toDateTimeString() : null,
                            'completed_by' => $status === 'done' ? $profile->user_id : null,
                            'comment' => $status === 'done' ? 'Выполнено на демо-стенде' : null,
                            'attachment_url' => $si === 0 ? '/demo/corporate-program.pdf' : null,
                            'created_at' => now()->subDays(20),
                            'updated_at' => now(),
                        ]
                    );
                }
            }
        }

        return $created;
    }

    /**
     * Раздел «Сценарии и тесты»: закрытые тесты с осмысленными вопросами и
     * наполненные сценарии ассессмента. Без этого раздел выглядит пустым.
     */
    private function ensureTestsAndScenarios(): int
    {
        $admin = $this->adminUserId();
        if (! $admin) return 0;
        $created = 0;

        if (Schema::hasTable('closed_question_tests')) {
            $positions = DB::table('positions')->where('company_id', $this->companyId)->pluck('id', 'title')->all();
            foreach ($this->testBlueprints() as $blueprint) {
                $existing = DB::table('closed_question_tests')
                    ->where('company_id', $this->companyId)->where('title', $blueprint['title'])->first();

                $payload = [
                    // Сотрудник должен видеть хотя бы демо-тесты независимо от должности: 
                    // строгая привязка к position_id оставляла раздел пустым у большинства профилей.
                    'position_id' => null,
                    'description' => $blueprint['description'],
                    'questions' => json_encode($blueprint['questions'], JSON_UNESCAPED_UNICODE),
                    'is_active' => true,
                    'updated_at' => now(),
                ];
                if (Schema::hasColumn('closed_question_tests', 'audience_rules')) {
                    $payload['audience_rules'] = json_encode(['user_ids' => [], 'departments' => [], 'position_ids' => []], JSON_UNESCAPED_UNICODE);
                }

                if ($existing) {
                    DB::table('closed_question_tests')->where('id', $existing->id)->update($payload);
                    $created++;
                    continue;
                }

                DB::table('closed_question_tests')->insert($payload + [
                    'id' => (string) Str::uuid(),
                    'company_id' => $this->companyId,
                    'title' => $blueprint['title'],
                    'created_by' => $admin,
                    'created_at' => now(),
                ]);
                $created++;
            }
        }

        if (Schema::hasTable('assessment_scenarios')) {
            foreach ($this->scenarioBlueprints() as $scenario) {
                $existing = DB::table('assessment_scenarios')
                    ->where('company_id', $this->companyId)->where('title', $scenario['title'])->first();

                $payload = [
                    'description' => $scenario['description'],
                    'scenario_data' => json_encode($scenario['data'], JSON_UNESCAPED_UNICODE),
                    'is_active' => true,
                    'updated_at' => now(),
                ];

                if ($existing) {
                    // Пустые сценарии (без шагов) дозаполняем, а не пропускаем.
                    $data = json_decode((string) $existing->scenario_data, true);
                    if (is_array($data) && ! empty($data['steps'])) continue;
                    DB::table('assessment_scenarios')->where('id', $existing->id)->update($payload);
                    $created++;
                    continue;
                }

                DB::table('assessment_scenarios')->insert($payload + [
                    'id' => (string) Str::uuid(),
                    'company_id' => $this->companyId,
                    'title' => $scenario['title'],
                    'created_by' => $admin,
                    'created_at' => now(),
                ]);
                $created++;
            }

            // Оставшиеся пустые сценарии из старых прогонов тоже наполняем.
            $blank = DB::table('assessment_scenarios')->where('company_id', $this->companyId)->get(['id', 'title', 'scenario_data']);
            $fallback = $this->scenarioBlueprints()[0];
            foreach ($blank as $i => $row) {
                $data = json_decode((string) $row->scenario_data, true);
                if (is_array($data) && ! empty($data['steps'])) continue;
                $template = $this->scenarioBlueprints()[$i % count($this->scenarioBlueprints())] ?? $fallback;
                $template['data']['title'] = (string) $row->title;
                DB::table('assessment_scenarios')->where('id', $row->id)->update([
                    'description' => $template['description'],
                    'scenario_data' => json_encode($template['data'], JSON_UNESCAPED_UNICODE),
                    'is_active' => true,
                    'updated_at' => now(),
                ]);
                $created++;
            }
        }

        return $created;
    }

    /** @return array<int, array{title:string, position:string, description:string, questions:array}> */
    private function testBlueprints(): array
    {
        $make = function (array $rows): array {
            $questions = [];
            foreach ($rows as $i => [$text, $competency, $options, $correct]) {
                $questions[] = [
                    'id' => 'q' . ($i + 1),
                    'text' => $text,
                    'competency' => $competency,
                    'weight' => 1,
                    'options' => array_map(fn ($opt, $k) => ['id' => chr(97 + $k), 'text' => $opt], $options, array_keys($options)),
                    'correct_option_id' => chr(97 + $correct),
                ];
            }
            return $questions;
        };

        return [
            [
                'title' => 'Входной тест: корпоративные стандарты',
                'position' => '—',
                'description' => 'Базовые правила работы в компании: коммуникация, безопасность данных, эскалация проблем.',
                'questions' => $make([
                    ['Коллега просит переслать ему персональные данные сотрудника в мессенджер. Как поступить?', 'Ответственность',
                        ['Переслать — это же коллега', 'Отказать и направить его в HR через официальный запрос', 'Переслать частично'], 1],
                    ['Вы поняли, что не успеваете к дедлайну. Когда сообщить руководителю?', 'Коммуникация',
                        ['В день дедлайна', 'Как только увидели риск', 'После дедлайна с объяснением'], 1],
                    ['Что делать с задачей, у которой нет явного владельца?', 'Планирование',
                        ['Игнорировать', 'Взять и зафиксировать владельца в трекере', 'Ждать указаний'], 1],
                    ['Как правильно дать обратную связь коллеге?', 'Коммуникация',
                        ['Публично и эмоционально', 'Наедине, по фактам и с конкретным предложением', 'Через руководителя анонимно'], 1],
                    ['Что относится к конфиденциальной информации?', 'Ответственность',
                        ['Публичный пресс-релиз', 'Зарплатные данные и клиентские договоры', 'Расписание корпоратива'], 1],
                ]),
            ],
            [
                'title' => 'Тест: коммуникация и работа с клиентом',
                'position' => 'Sales Manager',
                'description' => 'Проверка навыков клиентской коммуникации, работы с возражениями и приоритизации.',
                'questions' => $make([
                    ['Клиент недоволен сроками. Первый шаг?', 'Клиентоориентированность',
                        ['Оправдываться', 'Признать проблему и предложить план с новой датой', 'Передать другому менеджеру'], 1],
                    ['Как выявить настоящую потребность клиента?', 'Коммуникация',
                        ['Сразу презентовать продукт', 'Задать открытые вопросы и резюмировать', 'Прислать прайс'], 1],
                    ['Два срочных клиента одновременно. Что делаете?', 'Планирование',
                        ['Берёте того, кто громче', 'Оцениваете влияние и сообщаете обоим реальные сроки', 'Откладываете оба'], 1],
                    ['Возражение «дорого» — это чаще всего...', 'Переговоры',
                        ['Отказ', 'Сигнал о непонятой ценности', 'Повод дать максимальную скидку'], 1],
                    ['Что фиксировать после встречи с клиентом?', 'Ответственность',
                        ['Ничего', 'Договорённости, сроки и ответственных — письмом', 'Только сумму сделки'], 1],
                ]),
            ],
            [
                'title' => 'Тест: управление командой',
                'position' => 'Product Manager',
                'description' => 'Делегирование, обратная связь, работа с конфликтами и приоритетами команды.',
                'questions' => $make([
                    ['Сотрудник второй раз срывает срок. Ваши действия?', 'Наставничество',
                        ['Сделать задачу самому', 'Разобрать причины 1:1 и договориться о контрольных точках', 'Публично отчитать'], 1],
                    ['Что делегировать в первую очередь?', 'Делегирование',
                        ['Самое сложное и рискованное', 'Повторяющиеся задачи с понятным результатом', 'Ничего'], 1],
                    ['Конфликт двух сильных специалистов. Что делаете?', 'Работа в команде',
                        ['Ждёте, пока сами разберутся', 'Модерируете обсуждение по фактам и фиксируете правила', 'Разводите по разным проектам сразу'], 1],
                    ['Как измерять эффективность команды?', 'Аналитика',
                        ['По количеству часов в офисе', 'По достигнутым результатам и предсказуемости поставки', 'По числу закрытых чатов'], 1],
                    ['Приоритеты изменились в середине спринта. Что делать?', 'Адаптивность',
                        ['Игнорировать изменения', 'Пересобрать объём с командой и явно снять часть задач', 'Добавить новые задачи сверх плана'], 1],
                ]),
            ],
        ];
    }

    /** @return array<int, array{title:string, description:string, data:array}> */
    private function scenarioBlueprints(): array
    {
        $steps = fn (array $rows) => array_map(
            fn ($r) => ['title' => $r[0], 'duration' => $r[1], 'description' => $r[2]],
            $rows,
        );

        return [
            [
                'title' => 'Ассессмент руководителя команды',
                'description' => 'Ситуационные задачи на обратную связь, делегирование и принятие решений.',
                'data' => [
                    'title' => 'Ассессмент руководителя команды',
                    'brief' => 'Кандидат управляет командой из 6 человек в условиях сдвинутых сроков.',
                    'duration' => '60 минут',
                    'audience' => 'Руководители и кадровый резерв',
                    'competencies' => ['Лидерство', 'Делегирование', 'Обратная связь', 'Принятие решений'],
                    'steps' => $steps([
                        ['Введение и контекст', '5 минут', 'Ведущий описывает ситуацию: срыв срока по ключевому проекту.'],
                        ['Анализ вводных', '15 минут', 'Участник изучает данные команды и формулирует корневую причину.'],
                        ['План действий', '20 минут', 'Участник предлагает план восстановления сроков и распределяет роли.'],
                        ['Ролевая игра', '10 минут', 'Разговор 1:1 с демотивированным сотрудником.'],
                        ['Рефлексия', '10 минут', 'Самооценка и обратная связь наблюдателей.'],
                    ]),
                    'questions' => [
                        ['question' => 'Как вы определили ключевую проблему?', 'criteria' => 'структурность анализа', 'max_score' => 5],
                        ['question' => 'Какие альтернативы рассматривали?', 'criteria' => 'аргументация', 'max_score' => 5],
                        ['question' => 'Как донесёте решение до команды?', 'criteria' => 'коммуникация', 'max_score' => 5],
                        ['question' => 'Какие риски видите и как снизите?', 'criteria' => 'управление рисками', 'max_score' => 5],
                    ],
                ],
            ],
            [
                'title' => 'Оценка клиентского мышления',
                'description' => 'Практический сценарий работы со сложным запросом внутреннего клиента.',
                'data' => [
                    'title' => 'Оценка клиентского мышления',
                    'brief' => 'Внутренний заказчик требует функциональность вне дорожной карты.',
                    'duration' => '45 минут',
                    'audience' => 'Специалисты и менеджеры',
                    'competencies' => ['Клиентоориентированность', 'Коммуникация', 'Переговоры'],
                    'steps' => $steps([
                        ['Знакомство с запросом', '5 минут', 'Участник читает переписку с заказчиком.'],
                        ['Уточняющие вопросы', '10 минут', 'Диалог с ведущим в роли заказчика.'],
                        ['Предложение решения', '20 минут', 'Формулирование компромисса и сроков.'],
                        ['Обратная связь', '10 минут', 'Разбор наблюдателями.'],
                    ]),
                    'questions' => [
                        ['question' => 'Какую задачу заказчика вы решаете на самом деле?', 'criteria' => 'выявление потребности', 'max_score' => 5],
                        ['question' => 'Как вы говорите «нет» и сохраняете отношения?', 'criteria' => 'переговоры', 'max_score' => 5],
                        ['question' => 'Как зафиксируете договорённости?', 'criteria' => 'ответственность', 'max_score' => 5],
                    ],
                ],
            ],
            [
                'title' => 'Центр оценки кадрового резерва',
                'description' => 'Комплексный кейс для участников программы развития.',
                'data' => [
                    'title' => 'Центр оценки кадрового резерва',
                    'brief' => 'Групповой кейс: распределение ограниченного бюджета между тремя инициативами.',
                    'duration' => '90 минут',
                    'audience' => 'Кадровый резерв',
                    'competencies' => ['Стратегическое мышление', 'Работа в команде', 'Развитие людей'],
                    'steps' => $steps([
                        ['Индивидуальная подготовка', '15 минут', 'Каждый участник изучает свои вводные.'],
                        ['Групповая дискуссия', '35 минут', 'Команда согласует единое решение.'],
                        ['Презентация решения', '20 минут', 'Защита перед «правлением».'],
                        ['Индивидуальное интервью', '10 минут', 'Вопросы по вкладу участника.'],
                        ['Обратная связь', '10 минут', 'Разбор по каждой компетенции.'],
                    ]),
                    'questions' => [
                        ['question' => 'Какой вклад вы внесли в решение группы?', 'criteria' => 'работа в команде', 'max_score' => 5],
                        ['question' => 'На каких данных строился ваш выбор?', 'criteria' => 'аналитика', 'max_score' => 5],
                        ['question' => 'Как решение повлияет на людей?', 'criteria' => 'развитие людей', 'max_score' => 5],
                    ],
                ],
            ],
        ];
    }

    /** Приглашения сотрудников: раздел не должен быть пустым на демо-стенде. */
    private function ensureInvitations(): int
    {
        if (! Schema::hasTable('employee_invitations')) return 0;
        $admin = $this->adminUserId();
        if (! $admin) return 0;

        $have = DB::table('employee_invitations')->where('company_id', $this->companyId)->count();
        if ($have >= 5) return 0;

        $positions = DB::table('positions')->where('company_id', $this->companyId)->pluck('id')->all();
        $rows = [
            ['anna.orlova@candidate.demo', 'Анна Орлова', 'Маркетинг', 'employee', 'pending', 2],
            ['pavel.kim@candidate.demo', 'Павел Ким', 'Разработка', 'employee', 'pending', 6],
            ['irina.smirnova@candidate.demo', 'Ирина Смирнова', 'Продажи', 'manager', 'accepted', 14],
            ['oleg.petrov@candidate.demo', 'Олег Петров', 'Поддержка', 'employee', 'accepted', 21],
            ['maria.lviv@candidate.demo', 'Мария Львова', 'Финансы', 'employee', 'expired', 45],
        ];

        $created = 0;
        foreach ($rows as $i => [$email, $name, $department, $role, $status, $daysAgo]) {
            if (DB::table('employee_invitations')->where('company_id', $this->companyId)->where('email', $email)->exists()) continue;
            $created_at = now()->subDays($daysAgo);
            DB::table('employee_invitations')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $this->companyId,
                'email' => $email,
                'full_name' => $name,
                'position_id' => $positions[$i % max(1, count($positions))] ?? null,
                'department' => $department,
                'requested_role' => $role,
                'status' => $status,
                'invited_by' => $admin,
                'token' => Str::random(48),
                'created_at' => $created_at,
                'updated_at' => $created_at,
            ]);
            $created++;
        }

        return $created;
    }

    /** Performance: активный цикл с ревью, самооценкой и оценкой руководителя. */
    private function ensurePerformance(): int
    {
        if (! Schema::hasTable('performance_cycles') || ! Schema::hasTable('performance_reviews')) return 0;
        $admin = $this->adminUserId();
        if (! $admin) return 0;

        $cycle = DB::table('performance_cycles')->where('company_id', $this->companyId)
            ->orderByDesc('created_at')->first();
        if (! $cycle) {
            $cycleId = (string) Str::uuid();
            DB::table('performance_cycles')->insert([
                'id' => $cycleId,
                'company_id' => $this->companyId,
                'title' => 'Полугодовой ревью ' . now()->year . ' H' . (now()->month <= 6 ? '1' : '2'),
                'period_start' => now()->startOfMonth()->subMonths(5)->toDateString(),
                'period_end' => now()->endOfMonth()->toDateString(),
                'deadline' => now()->addDays(21)->toDateString(),
                'status' => 'active',
                'weights' => json_encode(['self' => 0.2, 'manager' => 0.5, 'peer' => 0.3], JSON_UNESCAPED_UNICODE),
                'created_by' => $admin,
                'created_at' => now()->subDays(20),
                'updated_at' => now(),
            ]);
        } else {
            $cycleId = (string) $cycle->id;
            if (($cycle->status ?? '') === 'draft') {
                DB::table('performance_cycles')->where('id', $cycleId)->update(['status' => 'active', 'updated_at' => now()]);
            }
        }

        $profiles = DB::table('profiles')->where('company_id', $this->companyId)
            ->limit(40)->get(['user_id', 'department']);
        if ($profiles->isEmpty()) return 0;

        $created = 0;
        foreach ($profiles as $i => $p) {
            $exists = DB::table('performance_reviews')->where('cycle_id', $cycleId)->where('user_id', $p->user_id)->exists();
            if ($exists) continue;

            $self = round(3.2 + (($i % 7) * 0.2), 2);
            $manager = round(3.0 + (($i % 6) * 0.25), 2);
            $peer = round(3.1 + (($i % 5) * 0.22), 2);
            $final = round($self * 0.2 + $manager * 0.5 + $peer * 0.3, 2);
            $status = ['self_review', 'manager_review', 'completed', 'completed'][$i % 4];

            $reviewId = (string) Str::uuid();
            DB::table('performance_reviews')->insert([
                'id' => $reviewId,
                'cycle_id' => $cycleId,
                'user_id' => $p->user_id,
                'company_id' => $this->companyId,
                'manager_id' => null,
                'status' => $status,
                'self_score' => $self,
                'manager_score' => $status === 'self_review' ? null : $manager,
                'peer_score' => $status === 'completed' ? $peer : null,
                'final_score' => $status === 'completed' ? $final : null,
                'summary' => $status === 'completed'
                    ? 'Стабильно выполняет план, сильные стороны — коммуникация и ответственность. Зона роста — планирование.'
                    : null,
                'finalized_at' => $status === 'completed' ? now()->subDays(3) : null,
                'created_at' => now()->subDays(18),
                'updated_at' => now(),
            ]);
            $created++;

            if (Schema::hasTable('performance_review_feedback') && $status !== 'self_review') {
                DB::table('performance_review_feedback')->insert([
                    'id' => (string) Str::uuid(),
                    'review_id' => $reviewId,
                    'reviewer_id' => $admin,
                    'role' => 'manager',
                    'competency_scores' => json_encode([
                        'Коммуникация' => 4, 'Ответственность' => 4, 'Планирование' => 3, 'Аналитика' => 4,
                    ], JSON_UNESCAPED_UNICODE),
                    'overall_score' => $manager,
                    'strengths' => 'Берёт ответственность за результат, хорошо работает с коллегами.',
                    'improvements' => 'Точнее оценивать сроки и заранее подсвечивать риски.',
                    'comments' => 'Рекомендую взять наставничество над новичком.',
                    'submitted_at' => now()->subDays(5),
                    'created_at' => now()->subDays(6),
                    'updated_at' => now(),
                ]);
            }
        }

        return $created;
    }

    /** Персональные документы: раздел «Мои документы» не должен быть пустым. */
    private function ensurePersonalDocuments(): int
    {
        if (! Schema::hasTable('hr_documents') || ! Schema::hasColumn('hr_documents', 'owner_user_id')) return 0;
        $admin = $this->adminUserId();
        if (! $admin) return 0;

        $profiles = DB::table('profiles')->where('company_id', $this->companyId)
            ->limit(60)->get(['user_id', 'full_name']);
        if ($profiles->isEmpty()) return 0;

        $hasValidUntil = Schema::hasColumn('hr_documents', 'valid_until');
        $hasValidFrom = Schema::hasColumn('hr_documents', 'valid_from');
        $hasConfidential = Schema::hasColumn('hr_documents', 'is_confidential');

        $templates = [
            ['contract', 'Трудовой договор', 'Бессрочный трудовой договор с приложениями.', null],
            ['order', 'Приказ о приёме на работу', 'Приказ по унифицированной форме Т-1.', null],
            ['medical', 'Медицинская книжка', 'Действует до указанной даты, требует продления.', 45],
        ];

        $created = 0;
        foreach ($profiles as $p) {
            $have = DB::table('hr_documents')->where('company_id', $this->companyId)
                ->where('owner_user_id', $p->user_id)->count();
            if ($have >= 2) continue;

            foreach (array_slice($templates, $have) as $index => [$type, $title, $description, $expiresInDays]) {
                $row = [
                    'id' => (string) Str::uuid(),
                    'company_id' => $this->companyId,
                    'document_type' => $type,
                    'title' => $title,
                    'description' => $description,
                    'owner_user_id' => $p->user_id,
                    'file_url' => null,
                    'file_name' => null,
                    'processing_status' => 'completed',
                    'created_by' => $admin,
                    'created_at' => now()->subDays(30 + $index),
                    'updated_at' => now(),
                ];
                if ($hasValidFrom) $row['valid_from'] = now()->subMonths(6)->toDateString();
                if ($hasValidUntil) $row['valid_until'] = $expiresInDays ? now()->addDays($expiresInDays)->toDateString() : null;
                if ($hasConfidential) $row['is_confidential'] = $type === 'contract';

                DB::table('hr_documents')->insert($row);
                $created++;
            }
        }

        return $created;
    }

    /** Автор демо-контента: HRD/админ компании, иначе любой сотрудник. */
    private function adminUserId(): ?string
    {
        $id = DB::table('profiles')->where('company_id', $this->companyId)
            ->whereIn('requested_role', ['hrd', 'company_admin', 'hr'])
            ->value('user_id');
        if (! $id) $id = DB::table('profiles')->where('company_id', $this->companyId)->value('user_id');
        return $id ? (string) $id : null;
    }


    /** Проверка результата: команда не должна «успешно» завершаться, ничего не наполнив. */
    private function verify(): void
    {
        $problems = [];

        $email = (string) $this->option('email');
        $target = DB::table('profiles')->join('users', 'users.id', '=', 'profiles.user_id')
            ->where('users.email', $email)->where('profiles.company_id', $this->companyId)
            ->select('profiles.*')->first();
        if ($target) {
            if (trim((string) ($target->avatar_url ?? '')) === '') $problems[] = "у {$email} нет аватара";
            if (trim((string) ($target->department ?? '')) === '') $problems[] = "у {$email} не заполнен отдел";
            if (Schema::hasTable('tracker_goals')
                && DB::table('tracker_goals')->where('holder_id', $target->user_id)->doesntExist()) {
                $problems[] = "у {$email} нет целей OKR";
            }
            if (Schema::hasTable('tracker_tasks')
                && DB::table('tracker_tasks')->where('assignee_id', $target->user_id)->doesntExist()) {
                $problems[] = "у {$email} пустой бэклог задач";
            }
        } else {
            $problems[] = "профиль {$email} не найден";
        }

        if (Schema::hasTable('tracker_workflows')
            && DB::table('tracker_workflows')->where('company_id', $this->companyId)->doesntExist()) {
            $problems[] = 'нет воркфлоу трекера';
        }
        if (Schema::hasTable('portal_posts')
            && DB::table('portal_posts')->where('company_id', $this->companyId)->whereNotNull('community_id')->doesntExist()) {
            $problems[] = 'в сообществах нет записей';
        }
        if (Schema::hasTable('portal_posts')) {
            $showcase = DB::table('portal_posts')->where('company_id', $this->companyId)
                ->where('title', 'Как оформить новость: гид по возможностям редактора')->first();
            $body = (string) ($showcase->body_md ?? '');
            $attachments = json_decode((string) ($showcase->attachments ?? '[]'), true);
            if (! $showcase || ! str_contains($body, '<h2>') || ! str_contains($body, '<h3>')
                || ! str_contains($body, '<img ') || ! str_contains($body, '<video ')
                || ! is_array($attachments) || count($attachments) < 2) {
                $problems[] = 'показательная новость создана не полностью';
            }
        }

        // Эталоны должностей: без них процент соответствия не считается.
        if (Schema::hasTable('positions') && Schema::hasColumn('positions', 'competency_profile')) {
            $withBenchmark = DB::table('positions')->where('company_id', $this->companyId)
                ->whereNotNull('competency_profile')->where('competency_profile', '<>', '[]')->count();
            $total = DB::table('positions')->where('company_id', $this->companyId)->count();
            if ($total > 0 && $withBenchmark < $total) {
                $problems[] = "эталон компетенций заполнен только у {$withBenchmark} из {$total} должностей";
            }
        }

        // Отсутствия: график «Доля отсутствий» строится за 6 месяцев.
        if (Schema::hasTable('leave_requests')) {
            $months = DB::table('leave_requests')->where('company_id', $this->companyId)
                ->where('status', 'approved')
                ->where('start_date', '>=', now()->startOfMonth()->subMonths(5)->toDateString())
                ->count();
            if ($months < 6) $problems[] = 'мало согласованных отсутствий за последние 6 месяцев';
        }

        if (Schema::hasTable('closed_question_tests')) {
            $filledTests = DB::table('closed_question_tests')->where('company_id', $this->companyId)->get(['questions'])
                ->filter(function ($row) {
                    $questions = json_decode((string) $row->questions, true);
                    return is_array($questions) && count($questions) >= 3;
                })->count();
            if ($filledTests < 3) $problems[] = "наполненных закрытых тестов только {$filledTests}";
        }

        if (Schema::hasTable('assessment_scenarios')) {
            $filledScenarios = DB::table('assessment_scenarios')->where('company_id', $this->companyId)->get(['scenario_data'])
                ->filter(function ($row) {
                    $data = json_decode((string) $row->scenario_data, true);
                    return is_array($data) && ! empty($data['steps']) && count($data['steps']) >= 3;
                })->count();
            if ($filledScenarios < 3) $problems[] = "наполненных сценариев оценки только {$filledScenarios}";
        }

        if (Schema::hasTable('pulse_surveys')) {
            $runningPulse = DB::table('pulse_surveys')->where('company_id', $this->companyId)->where('status', 'running')->count();
            if ($runningPulse < 1) $problems[] = 'нет активных pulse-опросов';
        }
        if (Schema::hasTable('onboarding_plans') && Schema::hasTable('onboarding_assignments')) {
            $plans = DB::table('onboarding_plans')->where('company_id', $this->companyId)->count();
            $assignments = DB::table('onboarding_assignments')->where('company_id', $this->companyId)->count();
            if ($plans < 1 || $assignments < 1) $problems[] = 'нет планов адаптации или назначений';
        }
        if (Schema::hasTable('employee_invitations')) {
            $invites = DB::table('employee_invitations')->where('company_id', $this->companyId)->count();
            if ($invites < 3) $problems[] = "приглашений сотрудников только {$invites}";
        }

        if ($problems) {
            throw new \RuntimeException('demo:seed-extras: ' . implode('; ', $problems) . '.');
        }
    }
}
