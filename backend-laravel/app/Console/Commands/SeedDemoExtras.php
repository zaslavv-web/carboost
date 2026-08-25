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

        $post = $this->ensureShowcasePost();
        $this->line("  показательная новость: {$post}");

        $community = $this->ensureCommunityContent();
        $this->line("  записей в сообществах: {$community}");

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

    private function fillCompetencies(): int
    {
        if (! Schema::hasTable('competencies')) return 0;

        $userIds = DB::table('profiles')->where('company_id', $this->companyId)->pluck('user_id')->all();
        $withSkills = DB::table('competencies')->where('company_id', $this->companyId)->distinct()->pluck('user_id')->map('strval')->all();
        $created = 0;

        foreach ($userIds as $i => $userId) {
            if (in_array((string) $userId, $withSkills, true)) continue;
            $rows = [];
            foreach (self::SKILLS as $k => $skill) {
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
            ->whereNull('parent_goal_id')->first();
        if (! $companyGoal) {
            $companyGoalId = $this->insertGoal($periodId, $owner, null, 'Вырасти в выручке на 30% за квартал',
                'Стратегическая цель компании на квартал: рост выручки, удержание команды и качество сервиса.', 42);
            $created++;
            $this->insertKeyResults($companyGoalId, [
                ['Выручка, млн ₽', 'млн ₽', 120, 156, 132],
                ['Удержание сотрудников, %', '%', 88, 94, 91],
                ['NPS клиентов', 'пункты', 41, 55, 47],
            ]);
        } else {
            $companyGoalId = (string) $companyGoal->id;
        }

        $byDepartment = $profiles->groupBy(fn ($p) => $p->department ?: 'Без отдела');
        foreach ($byDepartment as $department => $members) {
            $holder = (string) $members->first()->user_id;
            $title = "{$department}: выполнить квартальный план";
            $deptGoal = DB::table('tracker_goals')->where('company_id', $this->companyId)->where('title', $title)->first();
            if (! $deptGoal) {
                $deptGoalId = $this->insertGoal($periodId, $holder, $companyGoalId, $title,
                    "Цель отдела «{$department}» — вклад в стратегическую цель компании.", 55);
                $created++;
                $this->insertKeyResults($deptGoalId, [
                    ['Выполнение плана отдела, %', '%', 0, 100, 58],
                    ['Закрытые инициативы', 'шт', 0, 8, 5],
                ]);
            } else {
                $deptGoalId = (string) $deptGoal->id;
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
                    'Индивидуальная цель на квартал, связана с целью отдела.', 30 + (($index * 13) % 60));
                $created++;
                $this->insertKeyResults($goalId, [
                    ['Закрытые задачи в срок, %', '%', 60, 90, 72 + ($index % 10)],
                    ['Пройденные курсы', 'шт', 0, 3, 1 + ($index % 3)],
                ]);
            }
        }

        return $created;
    }

    private function insertGoal(?string $periodId, string $holderId, ?string $parentId, string $title, string $description, float $progress): string
    {
        $id = (string) Str::uuid();
        DB::table('tracker_goals')->insert([
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
        ]);

        return $id;
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
                ['announcement', 'Встреча сообщества на этой неделе', '<p>В четверг в 17:00 собираемся онлайн: разбираем кейсы участников и планируем следующие темы.</p><p><img src="https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1000&q=80" alt="Встреча сообщества"></p>'],
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

        if ($problems) {
            throw new \RuntimeException('demo:seed-extras: ' . implode('; ', $problems) . '.');
        }
    }
}
