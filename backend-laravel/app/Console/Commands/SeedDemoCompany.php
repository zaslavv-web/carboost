<?php

namespace App\Console\Commands;

use App\Services\CompanyRecoveryService;
use App\Services\AuthUserService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Наполнение демо-компании «ООО Демо».
 *
 * Идемпотентно: при повторном запуске без --reset — добавляет только недостающее.
 * С --reset — полностью удаляет прежнюю демо-компанию (по имени) и создаёт заново.
 *
 * Пользователи создаются с единым паролем DemoPass!2026.
 * Логины формата: role.NN@demo.pikrosta.ru
 */
class SeedDemoCompany extends Command
{
    protected $signature = 'demo:seed
        {--reset : Полностью удалить прежнюю демо-компанию перед созданием}
        {--headcount=150 : Общее количество сотрудников}
        {--name=ООО "Демо" : Название компании}';

    protected $description = 'Создаёт демо-компанию и наполняет её контентом по всем модулям';

    private string $companyName;
    private string $companyId;
    private array $userIds = [];       // все user_id по ролям: [role => [uuid,...]]
    private array $allUserIds = [];    // плоский список
    private array $departmentIds = []; // [name => uuid]
    private array $positionIds = [];   // [title => uuid]
    private array $trackIds = [];      // [title => uuid]
    private string $password = 'DemoPass!2026';
    private array $emailBook = [];     // [login => email]

    public function handle(AuthUserService $auth): int
    {
        $this->companyName = (string) $this->option('name');
        $headcount = max(20, (int) $this->option('headcount'));

        if ($this->option('reset')) {
            $this->warn("Удаляю прежнюю демо-компанию: {$this->companyName}");
            $this->resetCompany();
        }

        DB::transaction(function () use ($auth, $headcount) {
            $this->info('1/12  Создаю компанию…');
            $this->createCompany();

            $this->info('2/12  Создаю оргструктуру (отделы, должности)…');
            $this->createOrgStructure();
            $this->validateOrgStructure();

            $this->info('3/12  Создаю карьерные треки…');
            $this->createCareerTracks();

            $this->info("4/12  Создаю {$headcount} сотрудников…");
            $this->createUsers($auth, $headcount);
            $this->validateUsers();

            $this->info('5/12  Расставляю руководителей и team_members…');
            $this->assignManagers();

            $this->info('6/12  Валюта, кошельки, транзакции…');
            $this->seedCurrency();

            $this->info('7/12  Магазин: товары и заказы…');
            $this->seedShop();

            $this->info('8/12  HR-задачи и исполнители…');
            $this->seedHrTasks();

            $this->info('9/12  Тесты, попытки, компетенции, ассессменты…');
            $this->seedTestsAndAssessments();

            $this->info('10/12 Награды, признания, достижения…');
            $this->seedRewardsAndRecognition();

            $this->info('11/12 Комфорт, риски, инициативы, документы, анкеты…');
            $this->seedWave7AndDocuments();

            $this->info('12/12 Уведомления и чаты…');
            $this->seedNotificationsAndChats();
        });

        $this->validateSeedResult($headcount);
        $this->warnAboutMissingCompanies();

        $this->info("✅ Готово. company_id = {$this->companyId}");
        $this->line('Логины (единый пароль DemoPass!2026):');
        foreach (array_slice($this->emailBook, 0, 12, true) as $login => $email) {
            $this->line("  {$login}  →  {$email}");
        }
        $this->line('  … (полный список — в UI /superadmin/demo-seed)');
        return self::SUCCESS;
    }

    private function randomValue(array $items, string $context = 'array')
    {
        if ($items === []) {
            throw new \RuntimeException("Demo seed: пустой массив для случайного выбора ({$context}).");
        }

        return $items[array_rand($items)];
    }

    private function randomKey(array $items, string $context = 'array')
    {
        if ($items === []) {
            throw new \RuntimeException("Demo seed: пустой массив для случайного ключа ({$context}).");
        }

        return array_rand($items);
    }

    private function validateOrgStructure(): void
    {
        if ($this->departmentIds === []) {
            throw new \RuntimeException('Demo seed: не созданы отделы, дальнейшее наполнение невозможно.');
        }

        if ($this->positionIds === []) {
            throw new \RuntimeException('Demo seed: не созданы должности, дальнейшее наполнение невозможно.');
        }
    }

    private function validateUsers(): void
    {
        if ($this->allUserIds === []) {
            throw new \RuntimeException('Demo seed: не создан ни один пользователь, дальнейшее наполнение невозможно.');
        }

        if (empty($this->userIds['employee'])) {
            throw new \RuntimeException('Demo seed: не созданы сотрудники employee, невозможно назначить задачи и командную структуру.');
        }

        $missingPositionIds = DB::table('profiles')
            ->where('company_id', $this->companyId)
            ->whereIn('user_id', $this->allUserIds)
            ->whereNotNull('position')
            ->whereNull('position_id')
            ->count();

        if ($missingPositionIds > 0) {
            throw new \RuntimeException("Demo seed: у {$missingPositionIds} профилей есть должность без position_id.");
        }
    }

    private function validateSeedResult(int $expectedHeadcount): void
    {
        if (! DB::table('companies')->where('id', $this->companyId)->exists()) {
            throw new \RuntimeException("Demo seed: компания {$this->companyId} не найдена после завершения сидера.");
        }

        $profileCount = DB::table('profiles')->where('company_id', $this->companyId)->count();
        if ($profileCount < $expectedHeadcount) {
            throw new \RuntimeException("Demo seed: ожидалось минимум {$expectedHeadcount} профилей в компании, найдено {$profileCount}. Вероятно, существующие demo-пользователи не были привязаны к новой компании.");
        }

        $departmentCount = DB::table('departments')->where('company_id', $this->companyId)->count();
        $positionCount = DB::table('positions')->where('company_id', $this->companyId)->count();
        if ($departmentCount === 0 || $positionCount === 0) {
            throw new \RuntimeException("Demo seed: неполная оргструктура (departments={$departmentCount}, positions={$positionCount}).");
        }
    }

    private function warnAboutMissingCompanies(): void
    {
        try {
            $missing = app(CompanyRecoveryService::class)->missingCompanyIds(includeDemoOrphans: false);
        } catch (\Throwable $e) {
            Log::warning('Не удалось проверить missing companies после demo:seed: ' . $e->getMessage());
            return;
        }

        if ($missing === []) {
            return;
        }

        $this->warn('⚠️ Найдены данные, которые ссылаются на отсутствующие компании: ' . count($missing));
        $this->line('   Для восстановления строк companies запустите: php artisan companies:recover-missing --apply');
    }

    // ---------- reset ----------
    private function resetCompany(): void
    {
        $ids = DB::table('companies')->where('name', $this->companyName)->pluck('id')->all();
        if (!$ids) return;
        foreach ($ids as $cid) {
            $userIds = DB::table('profiles')->where('company_id', $cid)->pluck('user_id')->all();

            // Каскадно удаляем career_level_actions (нет company_id)
            if (Schema::hasTable('career_level_actions') && Schema::hasTable('career_track_templates')) {
                $tplIds = DB::table('career_track_templates')->where('company_id', $cid)->pluck('id')->all();
                if ($tplIds) {
                    DB::table('career_level_actions')->whereIn('template_id', $tplIds)->delete();
                }
            }


            foreach ([
                'comfort_scores','comfort_signal_events','initiative_votes','initiatives',
                'employee_risk_scores','peer_recognitions','peer_recognition_reactions',
                'achievements','employee_rewards','gamification_reward_types',
                'notifications','test_attempts','closed_question_tests',
                'career_step_submission_files','career_step_submissions','career_goals',
                'employee_career_assignments','career_step_scenarios','career_track_templates',
                'shop_cart_items','shop_order_items','shop_orders','shop_products',
                'hr_task_assignees','hr_tasks','hr_documents','employee_questionnaires',
                'competencies','assessments','currency_transactions','currency_balances',
                'company_currency_settings','team_members','position_career_paths','positions','departments',
                'company_onboarding_settings','employee_invitations','support_tickets',
            ] as $t) {
                if (Schema::hasTable($t) && Schema::hasColumn($t, 'company_id')) {
                    DB::table($t)->where('company_id', $cid)->delete();
                }
            }
            // chat_messages по conversation_id
            if (Schema::hasTable('chat_conversations')) {
                $convIds = DB::table('chat_conversations')->where('company_id', $cid)->pluck('id')->all();
                if ($convIds) {
                    DB::table('chat_message_reactions')
                        ->whereIn('message_id', DB::table('chat_messages')->whereIn('conversation_id', $convIds)->pluck('id')->all() ?: ['00000000-0000-0000-0000-000000000000'])
                        ->delete();
                    DB::table('chat_messages')->whereIn('conversation_id', $convIds)->delete();
                    DB::table('chat_participants')->whereIn('conversation_id', $convIds)->delete();
                    DB::table('chat_conversations')->whereIn('id', $convIds)->delete();
                }
            }
            // Профили и пользователи
            DB::table('profiles')->where('company_id', $cid)->delete();
            if ($userIds) {
                DB::table('user_roles')->whereIn('user_id', $userIds)->delete();
                DB::table('model_has_roles')->where(function ($q) use ($userIds) {
                    $q->whereIn('model_id', $userIds);
                })->delete();
                DB::table('users')->whereIn('id', $userIds)->delete();
            }
            DB::table('companies')->where('id', $cid)->delete();
        }
    }

    // ---------- 1. company ----------
    private function createCompany(): void
    {
        $existing = DB::table('companies')->where('name', $this->companyName)->first();
        if ($existing) {
            $this->companyId = (string) $existing->id;
            return;
        }
        $this->companyId = (string) Str::uuid();
        DB::table('companies')->insert([
            'id'          => $this->companyId,
            'name'        => $this->companyName,
            'description' => 'Демо-компания для внутренних тестов и презентаций.',
            'logo_url'    => null,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);
        if (Schema::hasTable('company_onboarding_settings')) {
            DB::table('company_onboarding_settings')->insert([
                'id'                     => (string) Str::uuid(),
                'company_id'             => $this->companyId,
                'auto_assign_tests'      => true,
                'auto_assign_tracks'     => true,
                'welcome_bonus_enabled'  => true,
                'welcome_bonus_amount'   => 100,
                'created_at'             => now(),
                'updated_at'             => now(),
            ]);
        }
        if (Schema::hasTable('company_currency_settings')) {
            DB::table('company_currency_settings')->insert([
                'id'            => (string) Str::uuid(),
                'company_id'    => $this->companyId,
                'currency_name' => 'Демо-коин',
                'currency_icon' => '⚡',
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);
        }
    }

    // ---------- 2. org ----------
    private function createOrgStructure(): void
    {
        $depts = [
            'Продукт'    => ['Product Manager','Product Owner','Product Analyst'],
            'Разработка' => ['Fullstack Developer','Backend Developer','Frontend Developer','QA Engineer','DevOps Engineer'],
            'Дизайн'     => ['UX/UI Designer','Product Designer'],
            'Продажи'    => ['Sales Manager','Head of Sales','Account Manager'],
            'Маркетинг'  => ['Marketing Manager','Content Manager','SEO Specialist'],
            'HR'         => ['HR Business Partner','Recruiter','L&D Specialist'],
            'Финансы'    => ['Financial Analyst','Accountant'],
            'Поддержка'  => ['Support Engineer','Customer Success Manager'],
        ];

        $competencyMap = $this->positionCompetencyMap();
        $psychoMap = $this->positionPsychologicalMap();

        foreach ($depts as $name => $positions) {
            $did = (string) Str::uuid();
            DB::table('departments')->insert([
                'id'          => $did,
                'company_id'  => $this->companyId,
                'name'        => $name,
                'description' => "Отдел «{$name}» демо-компании",
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
            $this->departmentIds[$name] = $did;

            foreach ($positions as $title) {
                $pid = (string) Str::uuid();
                $competencies = $competencyMap[$title] ?? [
                    ['skill' => 'Коммуникация', 'required_level' => 3],
                    ['skill' => 'Ответственность', 'required_level' => 4],
                    ['skill' => 'Работа в команде', 'required_level' => 3],
                ];
                $psycho = $psychoMap[$title] ?? [
                    ['trait' => 'Стрессоустойчивость', 'level' => 'выше среднего'],
                    ['trait' => 'Проактивность', 'level' => 'выше среднего'],
                ];
                DB::table('positions')->insert([
                    'id'             => $pid,
                    'company_id'     => $this->companyId,
                    'title'          => $title,
                    'description'    => $this->positionDescription($title, $name),
                    'department'     => $name,
                    'created_by'     => $this->companyId,
                    'profile_status' => 'approved',
                    'profile_version' => 1,
                    'psychological_profile' => json_encode($psycho, JSON_UNESCAPED_UNICODE),
                    'competency_profile'    => json_encode($competencies, JSON_UNESCAPED_UNICODE),
                    'profile_template' => json_encode(new \stdClass()),
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
                $this->positionIds[$title] = $pid;
            }
        }
    }

    private function positionDescription(string $title, string $dept): string
    {
        $map = [
            'Product Manager'          => 'Отвечает за продуктовую стратегию, roadmap, работу с рынком и запуск фич.',
            'Product Owner'            => 'Управляет бэклогом, приоритетами и работой команды разработки.',
            'Product Analyst'          => 'Анализирует продуктовые метрики, проводит A/B-тесты, готовит инсайты.',
            'Fullstack Developer'      => 'Разрабатывает end-to-end функциональность: фронтенд + бэкенд + БД.',
            'Backend Developer'        => 'Разрабатывает серверную логику, API, интеграции и БД.',
            'Frontend Developer'       => 'Реализует пользовательские интерфейсы, работает с React/TypeScript.',
            'QA Engineer'              => 'Тестирует релизы, автоматизирует регресс, ведёт баг-репорты.',
            'DevOps Engineer'          => 'Обеспечивает CI/CD, мониторинг, инфраструктуру и надёжность.',
            'UX/UI Designer'           => 'Проектирует пользовательский опыт и визуальный интерфейс.',
            'Product Designer'         => 'Отвечает за end-to-end дизайн продукта: исследования, UX, UI, дизайн-систему.',
            'Sales Manager'            => 'Ведёт сделки full-cycle, работает с воронкой и планом продаж.',
            'Head of Sales'            => 'Руководит отделом продаж, строит процессы и достигает revenue-целей.',
            'Account Manager'          => 'Развивает существующих клиентов, растит LTV и NPS.',
            'Marketing Manager'        => 'Отвечает за маркетинговую стратегию, каналы, кампании и бюджет.',
            'Content Manager'          => 'Планирует и создаёт контент для сайта, блога и соцсетей.',
            'SEO Specialist'           => 'Отвечает за поисковую оптимизацию и рост органического трафика.',
            'HR Business Partner'      => 'Партнёр бизнеса по людям: подбор, развитие, удержание, культура.',
            'Recruiter'                => 'Закрывает вакансии, ведёт воронку кандидатов, работает с брендом.',
            'L&D Specialist'           => 'Развивает сотрудников: тренинги, треки, оценка компетенций.',
            'Financial Analyst'        => 'Готовит финмодель, отчётность, unit-экономику и планирование.',
            'Accountant'               => 'Ведёт бухгалтерский и налоговый учёт, отчётность.',
            'Support Engineer'         => 'Обрабатывает обращения клиентов, диагностирует и решает инциденты.',
            'Customer Success Manager' => 'Обеспечивает достижение клиентом ценности продукта и продлевает контракты.',
        ];
        return $map[$title] ?? "Должность {$title} в отделе {$dept}.";
    }

    private function positionCompetencyMap(): array
    {
        $c = fn(string $s, int $l) => ['skill' => $s, 'required_level' => $l];
        return [
            'Product Manager'          => [$c('Продуктовое мышление',5), $c('Работа с метриками',4), $c('Стейкхолдер-менеджмент',5), $c('Roadmap-планирование',5), $c('User research',4)],
            'Product Owner'            => [$c('Управление бэклогом',5), $c('Agile/Scrum',5), $c('Приоритизация',4), $c('Коммуникация',5)],
            'Product Analyst'          => [$c('SQL',5), $c('Статистика',4), $c('A/B-тесты',4), $c('Визуализация данных',4)],
            'Fullstack Developer'      => [$c('React/TypeScript',4), $c('Node.js/PHP',4), $c('SQL',4), $c('Архитектура',4), $c('Ревью кода',4)],
            'Backend Developer'        => [$c('PHP/Laravel',5), $c('SQL',5), $c('API-дизайн',4), $c('Тестирование',4), $c('Производительность',4)],
            'Frontend Developer'       => [$c('React',5), $c('TypeScript',5), $c('CSS/Tailwind',4), $c('Доступность',3), $c('Производительность UI',4)],
            'QA Engineer'              => [$c('Тест-дизайн',5), $c('Автоматизация тестов',4), $c('API-тестирование',4), $c('Внимание к деталям',5)],
            'DevOps Engineer'          => [$c('Docker/K8s',5), $c('CI/CD',5), $c('Мониторинг',4), $c('IaC',4), $c('Безопасность',4)],
            'UX/UI Designer'           => [$c('UX-исследования',4), $c('Прототипирование',5), $c('Figma',5), $c('Дизайн-системы',4)],
            'Product Designer'         => [$c('Продуктовый дизайн',5), $c('UX-исследования',5), $c('Дизайн-системы',5), $c('Кроссфункциональная работа',4)],
            'Sales Manager'            => [$c('Ведение сделок',5), $c('Работа с возражениями',5), $c('CRM',4), $c('Переговоры',5)],
            'Head of Sales'            => [$c('Управление командой',5), $c('Sales-стратегия',5), $c('Прогнозирование',5), $c('Найм',4)],
            'Account Manager'          => [$c('Удержание клиентов',5), $c('Upsell/Cross-sell',4), $c('Коммуникация',5), $c('CRM',4)],
            'Marketing Manager'        => [$c('Маркетинг-стратегия',5), $c('Управление бюджетом',4), $c('Аналитика каналов',4), $c('Бренд',4)],
            'Content Manager'          => [$c('Копирайтинг',5), $c('Контент-план',5), $c('SEO-основы',3), $c('SMM',4)],
            'SEO Specialist'           => [$c('Техническое SEO',5), $c('Семантика',5), $c('Линкбилдинг',4), $c('Аналитика',4)],
            'HR Business Partner'      => [$c('Оценка людей',5), $c('Развитие сотрудников',5), $c('Конфликт-менеджмент',4), $c('HR-аналитика',4)],
            'Recruiter'                => [$c('Sourcing',5), $c('Интервью',5), $c('ATS',4), $c('Employer brand',4)],
            'L&D Specialist'           => [$c('Дизайн обучения',5), $c('Оценка компетенций',5), $c('Фасилитация',4)],
            'Financial Analyst'        => [$c('Финмоделирование',5), $c('Unit-экономика',5), $c('Excel/BI',5)],
            'Accountant'               => [$c('Бухучёт',5), $c('Налоги РФ',5), $c('1С',5)],
            'Support Engineer'         => [$c('Диагностика инцидентов',5), $c('Клиентоориентированность',5), $c('SQL',3)],
            'Customer Success Manager' => [$c('Onboarding клиента',5), $c('Retention',5), $c('Ведение аккаунтов',4)],
        ];
    }

    private function positionPsychologicalMap(): array
    {
        $t = fn(string $tr, string $lv) => ['trait' => $tr, 'level' => $lv];
        return [
            'Product Manager'          => [$t('Стратегическое мышление','высокое'), $t('Лидерство','выше среднего'), $t('Эмпатия','выше среднего'), $t('Проактивность','высокое')],
            'Backend Developer'        => [$t('Аналитическое мышление','высокое'), $t('Внимательность','высокое'), $t('Обучаемость','выше среднего')],
            'Frontend Developer'       => [$t('Внимательность','высокое'), $t('Эстетический вкус','выше среднего'), $t('Обучаемость','выше среднего')],
            'Fullstack Developer'      => [$t('Системное мышление','высокое'), $t('Обучаемость','высокое'), $t('Проактивность','выше среднего')],
            'QA Engineer'              => [$t('Скрупулёзность','высокое'), $t('Критическое мышление','высокое')],
            'DevOps Engineer'          => [$t('Ответственность','высокое'), $t('Стрессоустойчивость','высокое')],
            'Sales Manager'            => [$t('Целеустремлённость','высокое'), $t('Коммуникабельность','высокое'), $t('Стрессоустойчивость','высокое')],
            'Head of Sales'            => [$t('Лидерство','высокое'), $t('Ориентация на результат','высокое')],
            'HR Business Partner'      => [$t('Эмпатия','высокое'), $t('Дипломатичность','высокое'), $t('Аналитичность','выше среднего')],
            'Recruiter'                => [$t('Коммуникабельность','высокое'), $t('Настойчивость','выше среднего')],
            'Marketing Manager'        => [$t('Креативность','высокое'), $t('Аналитичность','выше среднего')],
            'UX/UI Designer'           => [$t('Креативность','высокое'), $t('Эмпатия к пользователю','высокое')],
            'Support Engineer'         => [$t('Клиентоориентированность','высокое'), $t('Терпеливость','высокое')],
            'Customer Success Manager' => [$t('Клиентоориентированность','высокое'), $t('Проактивность','высокое')],
        ];
    }


    // ---------- 3. career tracks ----------
    private function createCareerTracks(): void
    {
        // Основные (вертикальные) треки развития
        $tracks = [
            ['Backend Developer',  'Fullstack Developer',      12, 'Расширение фронтенд-стека к сильной серверной базе.'],
            ['Frontend Developer', 'Fullstack Developer',      12, 'Расширение бэкенд-стека к сильной клиентской базе.'],
            ['Fullstack Developer','Backend Developer',        9,  'Углубление в backend-архитектуру и производительность.'],
            ['QA Engineer',        'Backend Developer',        18, 'Переход из тестирования в разработку через автотесты и API.'],
            ['Sales Manager',      'Head of Sales',            18, 'Развитие управленческих навыков и стратегического планирования.'],
            ['Account Manager',    'Sales Manager',            9,  'Освоение full-cycle продаж и работы с новыми клиентами.'],
            ['Recruiter',          'HR Business Partner',      15, 'Расширение до партнёрства с бизнесом: развитие, оценка, удержание.'],
            ['L&D Specialist',     'HR Business Partner',      12, 'Партнёрство с бизнесом через управление людьми и оценку.'],
            ['Content Manager',    'Marketing Manager',        15, 'Развитие в маркетинговую стратегию, каналы и бюджет.'],
            ['SEO Specialist',     'Marketing Manager',        15, 'Расширение экспертизы за пределы органики: перфоманс, бренд.'],
            ['Support Engineer',   'Customer Success Manager', 12, 'Переход от инцидент-менеджмента к развитию клиентов.'],
            ['Product Analyst',    'Product Manager',          15, 'Углубление в продуктовую стратегию и работу со стейкхолдерами.'],
            ['Product Owner',      'Product Manager',          9,  'От управления бэклогом к продуктовой стратегии.'],
            ['UX/UI Designer',     'Product Designer',         12, 'Развитие в end-to-end продуктовый дизайн.'],
        ];
        foreach ($tracks as [$from, $to, $months, $strategy]) {
            if (!isset($this->positionIds[$from], $this->positionIds[$to])) continue;
            $tid = (string) Str::uuid();
            $steps = $this->trackStepsFor($from, $to);
            DB::table('career_track_templates')->insert([
                'id'                => $tid,
                'company_id'        => $this->companyId,
                'from_position_id'  => $this->positionIds[$from],
                'to_position_id'    => $this->positionIds[$to],
                'title'             => "Трек: {$from} → {$to}",
                'description'       => $strategy,
                'motivation_text'   => 'Пройдите трек, чтобы получить повышение и рост дохода.',
                'estimated_months'  => $months,
                'steps'             => json_encode($steps, JSON_UNESCAPED_UNICODE),
                'is_active'         => true,
                'created_by'        => $this->companyId,
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);
            $this->trackIds["{$from}→{$to}"] = $tid;

            // Сценарии шагов
            foreach ($steps as $i => $step) {
                DB::table('career_step_scenarios')->insert([
                    'id'               => (string) Str::uuid(),
                    'template_id'      => $tid,
                    'company_id'       => $this->companyId,
                    'step_order'       => $i + 1,
                    'requires_test'    => $i >= 1,
                    'min_test_score'   => 75,
                    'requires_files'   => $i >= 1,
                    'min_files'        => 1,
                    'requires_comment' => true,
                    'instructions'     => "Шаг {$step['title']}: сдайте требуемые артефакты и получите одобрение руководителя.",
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ]);
                // Действия внутри шага
                foreach ($step['goals'] as $gi => $goal) {
                    DB::table('career_level_actions')->insert([
                        'id'           => (string) Str::uuid(),
                        'template_id'  => $tid,
                        'action_text'  => $goal,
                        'action_order' => $i * 10 + $gi,
                        'is_required'  => true,
                        'category'     => ['knowledge','skill','ownership'][$i] ?? 'skill',
                        'created_at'   => now(),
                        'updated_at'   => now(),
                    ]);
                }
            }

            // Явная связь должностей в графе (для React Flow карьерных зависимостей)
            DB::table('position_career_paths')->updateOrInsert(
                [
                    'from_position_id' => $this->positionIds[$from],
                    'to_position_id'   => $this->positionIds[$to],
                ],
                [
                    'id'                   => (string) Str::uuid(),
                    'company_id'           => $this->companyId,
                    'strategy_description' => $strategy,
                    'requirements'         => json_encode(array_map(fn($s) => $s['title'], $steps), JSON_UNESCAPED_UNICODE),
                    'estimated_months'     => $months,
                    'created_by'           => $this->companyId,
                    'created_at'           => now(),
                    'updated_at'           => now(),
                ]
            );
        }

        // Дополнительные латеральные и кросс-функциональные связи (без полного трека, только граф)
        $lateral = [
            ['QA Engineer',            'DevOps Engineer',           15, 'Кросс-переход в инфраструктуру через автотесты и CI/CD.'],
            ['Frontend Developer',     'UX/UI Designer',            12, 'Кросс-переход в дизайн через сильный визуальный вкус и опыт UI.'],
            ['UX/UI Designer',         'Frontend Developer',        12, 'Переход в разработку через опыт с дизайн-системой и вёрсткой.'],
            ['Customer Success Manager','Account Manager',          6,  'Развитие в up-sell через клиентский опыт.'],
            ['Support Engineer',       'QA Engineer',               9,  'Развитие в тестирование через опыт диагностики.'],
            ['Recruiter',              'L&D Specialist',            9,  'Смежная роль: развитие компетенций и обучение.'],
            ['Product Owner',          'Product Analyst',           6,  'Кросс-переход в аналитику продукта.'],
            ['Marketing Manager',      'Product Manager',           15, 'Расширение до продуктовой стратегии.'],
            ['Financial Analyst',      'Product Analyst',           9,  'Смежная роль: аналитика с фокусом на продукт.'],
            ['Head of Sales',          'Product Manager',           18, 'Кросс-переход в продукт через глубокое понимание рынка.'],
        ];
        foreach ($lateral as [$from, $to, $months, $strategy]) {
            if (!isset($this->positionIds[$from], $this->positionIds[$to])) continue;
            DB::table('position_career_paths')->updateOrInsert(
                [
                    'from_position_id' => $this->positionIds[$from],
                    'to_position_id'   => $this->positionIds[$to],
                ],
                [
                    'id'                   => (string) Str::uuid(),
                    'company_id'           => $this->companyId,
                    'strategy_description' => $strategy,
                    'requirements'         => json_encode(['Совместные проекты','Ментор из целевой роли','Оценка компетенций'], JSON_UNESCAPED_UNICODE),
                    'estimated_months'     => $months,
                    'created_by'           => $this->companyId,
                    'created_at'           => now(),
                    'updated_at'           => now(),
                ]
            );
        }
    }

    private function trackStepsFor(string $from, string $to): array
    {
        return [
            [
                'title' => "База знаний ({$to})",
                'duration_months' => 2,
                'goals' => [
                    "Изучить материалы по роли «{$to}»",
                    "Пройти вводный тест на минимум 75%",
                    "Подготовить конспект ключевых различий {$from} → {$to}",
                ],
            ],
            [
                'title' => 'Прикладные навыки',
                'duration_months' => 4,
                'goals' => [
                    'Реализовать 3 задачи в зоне ответственности целевой роли',
                    'Получить письменное ревью от ментора',
                    'Прикрепить артефакты (документы/ссылки/скриншоты)',
                ],
            ],
            [
                'title' => 'Ответственность и владение',
                'duration_months' => 5,
                'goals' => [
                    'Взять owner-ship за проект длительностью не менее месяца',
                    'Провести не менее 2 наставнических сессий с младшими коллегами',
                    'Собрать 360-обратную связь и защитить результаты у HRD',
                ],
            ],
        ];
    }


    // ---------- 4. users ----------
    private function createUsers(AuthUserService $auth, int $headcount): void
    {
        // Распределение: 1 company_admin, 3 hrd, 12 manager, остальное — employee
        $roles = [
            'company_admin' => 1,
            'hrd'           => 3,
            'manager'       => 12,
        ];
        $roles['employee'] = $headcount - array_sum($roles);

        $namesM = ['Александр','Дмитрий','Максим','Иван','Артём','Сергей','Николай','Павел','Роман','Кирилл','Егор','Илья','Григорий','Андрей','Михаил'];
        $namesF = ['Анна','Мария','Екатерина','Ольга','Наталья','Юлия','Виктория','Дарья','Полина','Елена','Ирина','Татьяна','Алиса','Ксения','Софья'];
        $surM = ['Иванов','Смирнов','Кузнецов','Попов','Соколов','Новиков','Морозов','Волков','Козлов','Лебедев','Егоров','Павлов','Семёнов','Захаров'];
        $surF = ['Иванова','Смирнова','Кузнецова','Попова','Соколова','Новикова','Морозова','Волкова','Козлова','Лебедева','Егорова','Павлова','Семёнова','Захарова'];

        $seq = 1;
        foreach ($roles as $role => $count) {
            $this->userIds[$role] = [];
            for ($i = 0; $i < $count; $i++) {
                $isMale = ($seq % 2 === 0);
                $first = $isMale ? $this->randomValue($namesM, 'male first names') : $this->randomValue($namesF, 'female first names');
                $last  = $isMale ? $this->randomValue($surM, 'male surnames') : $this->randomValue($surF, 'female surnames');
                $full  = "{$first} {$last}";
                $login = sprintf('%s.%02d', $role, $i + 1);
                $email = "{$login}@demo.pikrosta.ru";
                $this->emailBook[$login] = $email;

                try {
                    $existingId = DB::table('users')->where('email', $email)->value('id');
                    if ($existingId) {
                        $uid = (string) $existingId;
                        $this->attachExistingDemoUser($uid, $email, $full, $role);
                    } else {
                        $user = $auth->createWithPassword(
                            $email,
                            $this->password,
                            $full,
                            $role,
                            companyId: $this->companyId,
                            isVerified: true,
                        );
                        $uid = (string) $user->id;
                    }

                    $this->userIds[$role][] = $uid;
                    $this->allUserIds[] = $uid;

                    // Проставим/обновим position/department/hire_date/avatar. Это важно для
                    // сценария, когда строку companies удалили, а demo-пользователи остались:
                    // повторный seed должен перепривязать их profile.company_id к новой компании.
                    $dept = $this->randomKey($this->departmentIds, 'departmentIds');
                    $posTitle = $this->pickPositionForRole($role, $dept);
                    DB::table('profiles')->where('user_id', $uid)->update([
                        'company_id'  => $this->companyId,
                        'full_name'   => $full,
                        'requested_role' => $role,
                        'is_verified' => true,
                        'department'  => $dept,
                        'position'    => $posTitle,
                        'position_id' => $this->positionIds[$posTitle] ?? null,
                        'avatar_url'  => 'https://api.dicebear.com/9.x/thumbs/svg?seed=' . urlencode($login),
                        'hire_date'   => now()->subDays(random_int(30, 1500))->toDateString(),
                        'overall_score'  => random_int(45, 92),
                        'role_readiness' => random_int(30, 90),
                        'updated_at'  => now(),
                    ]);
                } catch (\Throwable $e) {
                    Log::warning("Не удалось создать/обновить демо-пользователя {$email}: " . $e->getMessage());
                    $this->warn("  ! пропущен: {$email} — " . $e->getMessage());
                }
                $seq++;
            }
        }
    }

    private function attachExistingDemoUser(string $uid, string $email, string $fullName, string $role): void
    {
        $meta = [];
        $rawMeta = DB::table('users')->where('id', $uid)->value('meta');
        if (is_string($rawMeta) && $rawMeta !== '') {
            $decoded = json_decode($rawMeta, true);
            if (is_array($decoded)) $meta = $decoded;
        } elseif (is_array($rawMeta)) {
            $meta = $rawMeta;
        }
        $meta['company_id'] = $this->companyId;
        $meta['requested_role'] = $role;
        $meta['full_name'] = $fullName;
        $meta['email_verified'] = true;

        DB::table('users')->where('id', $uid)->update([
            'meta' => json_encode($meta, JSON_UNESCAPED_UNICODE),
            'email_verified_at' => DB::raw('COALESCE(email_verified_at, CURRENT_TIMESTAMP)'),
            'updated_at' => now(),
        ]);

        if (! DB::table('profiles')->where('user_id', $uid)->exists()) {
            DB::table('profiles')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $uid,
                'company_id' => $this->companyId,
                'full_name' => $fullName,
                'requested_role' => $role,
                'is_verified' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (! DB::table('user_roles')->where('user_id', $uid)->where('role', $role)->exists()) {
            DB::table('user_roles')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $uid,
                'role' => $role,
            ]);
        }
    }

    private function pickPositionForRole(string $role, string $dept): string
    {
        $byDept = [
            'Продукт'    => ['Product Manager','Product Owner','Product Analyst'],
            'Разработка' => ['Fullstack Developer','Backend Developer','Frontend Developer','QA Engineer','DevOps Engineer'],
            'Дизайн'     => ['UX/UI Designer','Product Designer'],
            'Продажи'    => ['Sales Manager','Account Manager'],
            'Маркетинг'  => ['Marketing Manager','Content Manager','SEO Specialist'],
            'HR'         => ['HR Business Partner','Recruiter','L&D Specialist'],
            'Финансы'    => ['Financial Analyst','Accountant'],
            'Поддержка'  => ['Support Engineer','Customer Success Manager'],
        ];
        if ($role === 'company_admin') return 'HR Business Partner';
        if ($role === 'hrd')           return 'HR Business Partner';
        if ($role === 'manager') {
            return match ($dept) {
                'Продажи'    => 'Head of Sales',
                'Разработка' => 'Fullstack Developer',
                default      => $byDept[$dept][0] ?? 'Product Manager',
            };
        }
        $list = $byDept[$dept] ?? ['Fullstack Developer'];
        return $this->randomValue($list, "positions for {$dept}");
    }

    // ---------- 5. managers ----------
    private function assignManagers(): void
    {
        $managers = $this->userIds['manager'] ?? [];
        $employees = $this->userIds['employee'] ?? [];
        if (!$managers || !$employees) return;

        foreach ($employees as $eid) {
            $mid = $this->randomValue($managers, 'managers');
            DB::table('team_members')->insertOrIgnore([
                'id'          => (string) Str::uuid(),
                'company_id'  => $this->companyId,
                'manager_id'  => $mid,
                'employee_id' => $eid,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        }

        // назначим head отделов из числа manager
        $i = 0;
        foreach ($this->departmentIds as $name => $did) {
            $head = $managers[$i % count($managers)];
            DB::table('departments')->where('id', $did)->update(['head_user_id' => $head]);
            $i++;
        }
    }

    // ---------- 6. currency ----------
    private function seedCurrency(): void
    {
        foreach ($this->allUserIds as $uid) {
            $balance = random_int(50, 2500);
            DB::table('currency_balances')->insertOrIgnore([
                'id'         => (string) Str::uuid(),
                'user_id'    => $uid,
                'company_id' => $this->companyId,
                'balance'    => $balance,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $txCount = random_int(2, 6);
            for ($i = 0; $i < $txCount; $i++) {
                DB::table('currency_transactions')->insert([
                    'id'          => (string) Str::uuid(),
                    'user_id'     => $uid,
                    'company_id'  => $this->companyId,
                    'amount'      => random_int(-200, 400),
                    'kind'        => ['earn_reward','purchase','welcome_bonus','peer_recognition'][random_int(0,3)],
                    'description' => 'Демо-транзакция',
                    'created_at'  => now()->subDays(random_int(0, 90)),
                    'updated_at'  => now(),
                ]);
            }
        }
    }

    // ---------- 7. shop ----------
    private function seedShop(): void
    {
        $products = [
            ['Худи с логотипом', 'Тёплое худи с корпоративной символикой', 800, 20],
            ['Дополнительный день отпуска', 'Один оплачиваемый день отдыха', 1500, 5],
            ['Курс на Coursera', 'Оплата любого курса на выбор', 2000, 3],
            ['Умная колонка', 'Яндекс.Станция Мини', 3500, 10],
            ['Обед с CEO', 'Личная встреча за обедом', 500, 2],
            ['Мерч-набор', 'Кружка + блокнот + стикеры', 250, 50],
            ['Подписка Kion на год', 'Онлайн-кинотеатр', 1200, 15],
            ['Массаж 60 минут', 'Сертификат в партнёрскую сеть', 900, 30],
        ];
        $productIds = [];
        $admin = ($this->userIds['company_admin'][0] ?? $this->userIds['hrd'][0] ?? $this->allUserIds[0]);
        foreach ($products as [$title, $desc, $price, $stock]) {
            $pid = (string) Str::uuid();
            DB::table('shop_products')->insert([
                'id'          => $pid,
                'company_id'  => $this->companyId,
                'title'       => $title,
                'description' => $desc,
                'price'       => $price,
                'stock'       => $stock,
                'period_kind' => 'none',
                'is_active'   => true,
                'created_by'  => $admin,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
            $productIds[] = ['id' => $pid, 'title' => $title, 'price' => $price];
        }

        // Заказы
        for ($i = 0; $i < 30; $i++) {
            $buyer = $this->randomValue($this->allUserIds, 'allUserIds');
            $prod = $this->randomValue($productIds, 'shop products');
            $qty = random_int(1, 2);
            $total = $prod['price'] * $qty;
            $oid = (string) Str::uuid();
            DB::table('shop_orders')->insert([
                'id'           => $oid,
                'user_id'      => $buyer,
                'company_id'   => $this->companyId,
                'total_amount' => $total,
                'status'       => ['pending_fulfillment','fulfilled','fulfilled','cancelled'][random_int(0,3)],
                'created_at'   => now()->subDays(random_int(0, 60)),
                'updated_at'   => now(),
            ]);
            DB::table('shop_order_items')->insert([
                'id'            => (string) Str::uuid(),
                'order_id'      => $oid,
                'product_id'    => $prod['id'],
                'quantity'      => $qty,
                'unit_price'    => $prod['price'],
                'subtotal'      => $total,
                'product_title' => $prod['title'],
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);
        }
    }

    // ---------- 8. HR tasks ----------
    private function seedHrTasks(): void
    {
        $titles = [
            ['Ознакомиться с Welcome-book', 'onboarding', 100],
            ['Пройти обязательный тест по безопасности', 'compliance', 150],
            ['Заполнить анкету сотрудника', 'hr', 100],
            ['Сдать курс "Инструменты платформы"', 'learning', 200],
            ['Обновить фото профиля', 'personal', 30],
            ['Согласовать цели на квартал с руководителем', 'performance', 300],
        ];
        $admin = ($this->userIds['hrd'][0] ?? $this->allUserIds[0]);
        foreach ($titles as [$t, $cat, $reward]) {
            $tid = (string) Str::uuid();
            DB::table('hr_tasks')->insert([
                'id'           => $tid,
                'company_id'   => $this->companyId,
                'created_by'   => $admin,
                'title'        => $t,
                'description'  => "Демо-задача: {$t}",
                'category'     => $cat,
                'reward_coins' => $reward,
                'deadline'     => now()->addDays(random_int(3, 30))->toDateString(),
                'status'       => 'active',
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);
            // назначаем 30-70% сотрудников
            $employees = $this->userIds['employee'];
            shuffle($employees);
            $slice = array_slice($employees, 0, (int) (count($employees) * (random_int(30, 70) / 100)));
            foreach ($slice as $uid) {
                DB::table('hr_task_assignees')->insert([
                    'id'                => (string) Str::uuid(),
                    'task_id'           => $tid,
                    'user_id'           => $uid,
                    'individual_status' => ['assigned','in_progress','done'][random_int(0,2)],
                    'reward_paid'       => false,
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
            }
        }
    }

    // ---------- 9. tests + assessments ----------
    private function seedTestsAndAssessments(): void
    {
        $admin = ($this->userIds['hrd'][0] ?? $this->allUserIds[0]);
        $tests = [];
        foreach (['Product Manager','Fullstack Developer','Sales Manager','HR Business Partner'] as $posTitle) {
            if (!isset($this->positionIds[$posTitle])) continue;
            $tid = (string) Str::uuid();
            $questions = [];
            for ($i = 1; $i <= 5; $i++) {
                $questions[] = [
                    'id' => "q{$i}",
                    'text' => "Вопрос {$i} для {$posTitle}?",
                    'competency' => ['Коммуникация','Ответственность','Технические навыки'][($i-1) % 3],
                    'weight' => 1,
                    'options' => [
                        ['id' => 'a', 'text' => 'Вариант A'],
                        ['id' => 'b', 'text' => 'Вариант B'],
                        ['id' => 'c', 'text' => 'Вариант C'],
                    ],
                    'correct_option_id' => ['a','b','c'][$i % 3],
                ];
            }
            DB::table('closed_question_tests')->insert([
                'id'          => $tid,
                'company_id'  => $this->companyId,
                'position_id' => $this->positionIds[$posTitle],
                'title'       => "Тест: {$posTitle}",
                'description' => "Проверочный тест для позиции {$posTitle}",
                'questions'   => json_encode($questions),
                'is_active'   => true,
                'created_by'  => $admin,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
            $tests[] = $tid;
        }

        // попытки, компетенции, ассессменты
        foreach ($this->allUserIds as $uid) {
            if ($tests && random_int(1, 100) <= 70) {
                $tid = $this->randomValue($tests, 'tests');
                DB::table('test_attempts')->insert([
                    'id'                    => (string) Str::uuid(),
                    'user_id'               => $uid,
                    'company_id'            => $this->companyId,
                    'test_id'               => $tid,
                    'test_source'           => 'hrd',
                    'answers'               => json_encode([]),
                    'competency_breakdown'  => json_encode([
                        ['competency' => 'Коммуникация', 'score' => random_int(40, 95), 'total' => 100],
                        ['competency' => 'Ответственность', 'score' => random_int(40, 95), 'total' => 100],
                    ]),
                    'score'                 => random_int(40, 95),
                    'total'                 => 100,
                    'created_at'            => now()->subDays(random_int(1, 120)),
                    'updated_at'            => now(),
                ]);
            }
            foreach (['Коммуникация','Ответственность','Инициативность','Технические навыки'] as $skill) {
                DB::table('competencies')->insert([
                    'id'          => (string) Str::uuid(),
                    'user_id'     => $uid,
                    'company_id'  => $this->companyId,
                    'skill_name'  => $skill,
                    'skill_value' => random_int(35, 95),
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]);
            }
            if (random_int(1, 100) <= 40) {
                DB::table('assessments')->insert([
                    'id'              => (string) Str::uuid(),
                    'user_id'         => $uid,
                    'company_id'      => $this->companyId,
                    'assessment_type' => 'ai_360',
                    'score'           => random_int(50, 95),
                    'change_value'    => (string) random_int(-5, 12),
                    'assessment_data' => json_encode(['note' => 'Демо-ассессмент']),
                    'created_at'      => now()->subDays(random_int(1, 200)),
                    'updated_at'      => now(),
                ]);
            }
        }
    }

    // ---------- 10. rewards, achievements, peer recognition ----------
    private function seedRewardsAndRecognition(): void
    {
        $admin = ($this->userIds['hrd'][0] ?? $this->allUserIds[0]);

        // reward types
        $rewardTypes = [
            ['Молодец месяца', 'achievement', 'trophy', 500],
            ['Наставник года', 'achievement', 'graduation-cap', 1000],
            ['Кофе с CEO', 'non_monetary', 'coffee', 0],
            ['Онлайн-курс на выбор', 'digital_gift', 'gift', 0],
        ];
        $rtIds = [];
        foreach ($rewardTypes as [$title, $kind, $icon, $points]) {
            $id = (string) Str::uuid();
            DB::table('gamification_reward_types')->insert([
                'id'          => $id,
                'company_id'  => $this->companyId,
                'title'       => $title,
                'description' => "Награда: {$title}",
                'category'    => 'engagement',
                'icon'        => $icon,
                'points'      => $points,
                'is_active'   => true,
                'created_by'  => $admin,
                'reward_kind' => $kind,
                'trigger_mode' => 'manual',
                'trigger_events' => json_encode([]),
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
            $rtIds[] = $id;
        }

        // достижения
        foreach ($this->allUserIds as $uid) {
            if (random_int(1, 100) <= 60) {
                DB::table('achievements')->insert([
                    'id'                => (string) Str::uuid(),
                    'user_id'           => $uid,
                    'company_id'        => $this->companyId,
                    'title'             => '🏆 ' . ['Прокачал компетенцию','Закрыл 10 задач','Прошёл онбординг','Наставник'][ random_int(0,3)],
                    'description'       => 'Демо-достижение',
                    'icon'              => 'award',
                    'achievement_date'  => now()->subDays(random_int(0, 180))->toDateString(),
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
            }
        }

        // peer recognitions
        for ($i = 0; $i < 80; $i++) {
            $from = $this->randomValue($this->allUserIds, 'allUserIds');
            $to = $this->randomValue($this->allUserIds, 'allUserIds');
            if ($from === $to) continue;
            DB::table('peer_recognitions')->insert([
                'id'          => (string) Str::uuid(),
                'company_id'  => $this->companyId,
                'from_user_id'=> $from,
                'to_user_id'  => $to,
                'category'    => ['teamwork','initiative','mentorship','quality'][random_int(0,3)],
                'message'     => 'Спасибо за помощь и профессионализм!',
                'coin_reward' => random_int(10, 100),
                'created_at'  => now()->subDays(random_int(0, 90)),
                'updated_at'  => now(),
            ]);
        }
    }

    // ---------- 11. wave7 comfort + risks + initiatives + docs + questionnaires ----------
    private function seedWave7AndDocuments(): void
    {
        // risk scores
        foreach ($this->allUserIds as $uid) {
            $attr = random_int(5, 95); $burn = random_int(5, 95); $eng = random_int(20, 95);
            $level = $attr > 70 ? 'high' : ($attr > 40 ? 'medium' : 'low');
            DB::table('employee_risk_scores')->insertOrIgnore([
                'id'               => (string) Str::uuid(),
                'user_id'          => $uid,
                'company_id'       => $this->companyId,
                'attrition_risk'   => $attr,
                'burnout_risk'     => $burn,
                'engagement_score' => $eng,
                'risk_level'       => $level,
                'factors'          => json_encode(['workload' => random_int(1,5), 'chats' => random_int(1,5)]),
                'recommendations'  => json_encode(['Провести 1:1', 'Пересмотреть нагрузку']),
                'computed_at'      => now(),
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);
        }

        // comfort_scores
        if (Schema::hasTable('comfort_scores')) {
            $today = now()->toDateString();
            $monthAgo = now()->subDays(30)->toDateString();

            $companyIdx = random_int(55, 78);
            DB::table('comfort_scores')->updateOrInsert(
                ['company_id' => $this->companyId, 'scope' => 'company', 'scope_id' => null, 'period_start' => $monthAgo],
                [
                    'id' => (string) Str::uuid(),
                    'tov_score' => random_int(50,80),
                    'kpi_score' => random_int(55,85),
                    'career_score' => random_int(50,80),
                    'comfort_index' => $companyIdx,
                    'risk_level' => $companyIdx < 60 ? 'medium' : 'low',
                    'trend' => 'flat',
                    'trend_delta' => 0,
                    'period_end' => $today,
                    'computed_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
            foreach ($this->departmentIds as $name => $did) {
                $idx = random_int(45, 90);
                DB::table('comfort_scores')->updateOrInsert(
                    ['company_id' => $this->companyId, 'scope' => 'department', 'scope_id' => $did, 'period_start' => $monthAgo],
                    [
                        'id' => (string) Str::uuid(),
                        'tov_score' => random_int(40,90), 'kpi_score' => random_int(40,90), 'career_score' => random_int(40,90),
                        'comfort_index' => $idx,
                        'risk_level' => $idx < 50 ? 'high' : ($idx < 65 ? 'medium' : 'low'),
                        'trend' => ['up','flat','down'][random_int(0,2)],
                        'trend_delta' => random_int(-8, 8),
                        'period_end' => $today,
                        'computed_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );
            }
            foreach ($this->allUserIds as $uid) {
                $idx = random_int(30, 95);
                DB::table('comfort_scores')->updateOrInsert(
                    ['company_id' => $this->companyId, 'scope' => 'user', 'scope_id' => $uid, 'period_start' => $monthAgo],
                    [
                        'id' => (string) Str::uuid(),
                        'tov_score' => random_int(30,95), 'kpi_score' => random_int(30,95), 'career_score' => random_int(30,95),
                        'comfort_index' => $idx,
                        'risk_level' => $idx < 40 ? 'critical' : ($idx < 55 ? 'high' : ($idx < 70 ? 'medium' : 'low')),
                        'trend' => ['up','flat','down'][random_int(0,2)],
                        'trend_delta' => random_int(-10, 10),
                        'period_end' => $today,
                        'computed_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );
            }
        }

        // initiatives
        if (Schema::hasTable('initiatives')) {
            $ideas = [
                ['Внедрить внутренний хакатон',        'process'],
                ['Автоматизировать отчёты в трекере',  'tech'],
                ['Клуб английского языка по средам',   'culture'],
                ['A/B-тесты онбординга',               'product'],
                ['Общий Notion для команд',            'process'],
                ['Челлендж «10 000 шагов»',            'culture'],
                ['Открытая база знаний',               'process'],
                ['Peer-review код-стайл раз в спринт', 'tech'],
            ];
            foreach ($ideas as [$title, $cat]) {
                $iid = (string) Str::uuid();
                $author = $this->randomValue($this->allUserIds, 'allUserIds');
                DB::table('initiatives')->insert([
                    'id' => $iid, 'company_id' => $this->companyId, 'author_id' => $author,
                    'title' => $title, 'description' => 'Демо-инициатива: ' . $title,
                    'category' => $cat, 'status' => ['new','in_review','accepted'][random_int(0,2)],
                    'votes_count' => 0,
                    'created_at' => now()->subDays(random_int(1, 60)), 'updated_at' => now(),
                ]);
                $voters = $this->allUserIds;
                shuffle($voters);
                $cnt = random_int(3, 25);
                foreach (array_slice($voters, 0, $cnt) as $v) {
                    DB::table('initiative_votes')->insertOrIgnore([
                        'id' => (string) Str::uuid(),
                        'initiative_id' => $iid,
                        'user_id' => $v,
                        'created_at' => now(),
                    ]);
                }
                DB::table('initiatives')->where('id', $iid)->update(['votes_count' => $cnt]);
            }
        }

        // questionnaires (для ~30% сотрудников)
        foreach ($this->allUserIds as $uid) {
            if (random_int(1, 100) > 30) continue;
            DB::table('employee_questionnaires')->insert([
                'id'                => (string) Str::uuid(),
                'user_id'           => $uid,
                'company_id'        => $this->companyId,
                'position_id'       => $this->randomValue($this->positionIds, 'positionIds'),
                'status'            => 'confirmed',
                'version'           => 1,
                'answers'           => json_encode(['basic' => ['department' => 'Разработка'], 'competencies' => []]),
                'skill_gaps'        => json_encode([]),
                'submitted_at'      => now()->subDays(random_int(1, 60)),
                'confirmed_at'      => now()->subDays(random_int(0, 30)),
                'next_update_due_at'=> now()->addMonths(6),
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);
        }

        // hr_documents
        $admin = ($this->userIds['hrd'][0] ?? $this->allUserIds[0]);
        foreach (['Welcome book','Политика ИБ','Регламент отпусков','Кодекс общения'] as $doc) {
            DB::table('hr_documents')->insert([
                'id'                => (string) Str::uuid(),
                'company_id'        => $this->companyId,
                'created_by'        => $admin,
                'document_type'     => 'policy',
                'title'             => $doc,
                'description'       => "Демо-документ: {$doc}",
                'file_url'          => null,
                'file_name'         => null,
                'processing_status' => 'processed',
                'extracted_data'    => json_encode(new \stdClass()),
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);
        }
    }

    // ---------- 12. notifications + chats ----------
    private function seedNotificationsAndChats(): void
    {
        foreach ($this->allUserIds as $uid) {
            $count = random_int(1, 4);
            for ($i = 0; $i < $count; $i++) {
                DB::table('notifications')->insert([
                    'id'                => (string) Str::uuid(),
                    'user_id'           => $uid,
                    'company_id'        => $this->companyId,
                    'title'             => ['🎉 Добро пожаловать','🏆 Новая награда','📋 Новая задача','💡 Инициатива принята'][random_int(0,3)],
                    'description'       => 'Демо-уведомление для наполнения ленты.',
                    'notification_type' => 'info',
                    'is_read'           => random_int(0, 1) === 1,
                    'created_at'        => now()->subDays(random_int(0, 30)),
                    'updated_at'        => now(),
                ]);
            }
        }

        // Общий чат
        if (Schema::hasTable('chat_conversations')) {
            $cid = (string) Str::uuid();
            DB::table('chat_conversations')->insert([
                'id' => $cid,
                'company_id' => $this->companyId,
                'type' => 'group',
                'title' => 'Общий чат',
                'created_by' => $this->allUserIds[0],
                'last_message_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            foreach ($this->allUserIds as $uid) {
                DB::table('chat_participants')->insertOrIgnore([
                    'id' => (string) Str::uuid(),
                    'conversation_id' => $cid,
                    'user_id' => $uid,
                    'role' => 'member',
                    'joined_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            $msgs = ['Всем привет!','Кто идёт на пятничный митап?','Обновил доску в трекере','Классная инициатива!','Ищу пейр-программера'];
            for ($i = 0; $i < 30; $i++) {
                DB::table('chat_messages')->insert([
                    'id' => (string) Str::uuid(),
                    'conversation_id' => $cid,
                    'sender_id' => $this->randomValue($this->allUserIds, 'allUserIds'),
                    'body' => $this->randomValue($msgs, 'chat messages'),
                    'created_at' => now()->subMinutes(random_int(5, 60 * 24 * 7)),
                    'updated_at' => now(),
                ]);
            }
        }
    }
}
