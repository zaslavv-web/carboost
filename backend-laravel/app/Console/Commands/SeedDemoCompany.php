<?php

namespace App\Console\Commands;

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

            $this->info('3/12  Создаю карьерные треки…');
            $this->createCareerTracks();

            $this->info("4/12  Создаю {$headcount} сотрудников…");
            $this->createUsers($auth, $headcount);

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

        $this->info("✅ Готово. company_id = {$this->companyId}");
        $this->line('Логины (единый пароль DemoPass!2026):');
        foreach (array_slice($this->emailBook, 0, 12, true) as $login => $email) {
            $this->line("  {$login}  →  {$email}");
        }
        $this->line('  … (полный список — в UI /superadmin/demo-seed)');
        return self::SUCCESS;
    }

    // ---------- reset ----------
    private function resetCompany(): void
    {
        $ids = DB::table('companies')->where('name', $this->companyName)->pluck('id')->all();
        if (!$ids) return;
        foreach ($ids as $cid) {
            $userIds = DB::table('profiles')->where('company_id', $cid)->pluck('user_id')->all();

            foreach ([
                'comfort_scores','comfort_signal_events','initiative_votes','initiatives',
                'employee_risk_scores','peer_recognitions','peer_recognition_reactions',
                'achievements','employee_rewards','gamification_reward_types',
                'notifications','test_attempts','closed_question_tests',
                'career_step_submission_files','career_step_submissions','career_goals',
                'employee_career_assignments','career_track_templates',
                'shop_cart_items','shop_order_items','shop_orders','shop_products',
                'hr_task_assignees','hr_tasks','hr_documents','employee_questionnaires',
                'competencies','assessments','currency_transactions','currency_balances',
                'company_currency_settings','team_members','positions','departments',
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
                DB::table('positions')->insert([
                    'id'             => $pid,
                    'company_id'     => $this->companyId,
                    'title'          => $title,
                    'description'    => "Должность {$title} в отделе {$name}.",
                    'department'     => $name,
                    'created_by'     => $this->companyId, // будет обновлено позже
                    'profile_status' => 'approved',
                    'profile_version' => 1,
                    'psychological_profile' => json_encode(new \stdClass()),
                    'competency_profile'    => json_encode([
                        ['skill' => 'Коммуникация', 'level' => 3],
                        ['skill' => 'Ответственность', 'level' => 4],
                    ]),
                    'profile_template' => json_encode(new \stdClass()),
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
                $this->positionIds[$title] = $pid;
            }
        }
    }

    // ---------- 3. career tracks ----------
    private function createCareerTracks(): void
    {
        $tracks = [
            ['Backend Developer', 'Fullstack Developer'],
            ['Frontend Developer', 'Fullstack Developer'],
            ['Sales Manager', 'Head of Sales'],
            ['Recruiter', 'HR Business Partner'],
            ['Content Manager', 'Marketing Manager'],
            ['Support Engineer', 'Customer Success Manager'],
        ];
        foreach ($tracks as [$from, $to]) {
            if (!isset($this->positionIds[$from], $this->positionIds[$to])) continue;
            $tid = (string) Str::uuid();
            DB::table('career_track_templates')->insert([
                'id'                => $tid,
                'company_id'        => $this->companyId,
                'from_position_id'  => $this->positionIds[$from],
                'to_position_id'    => $this->positionIds[$to],
                'title'             => "Трек: {$from} → {$to}",
                'description'       => "Карьерный трек развития от {$from} до {$to}.",
                'motivation_text'   => 'Пройдите трек, чтобы получить повышение и рост дохода.',
                'estimated_months'  => 9,
                'steps'             => json_encode([
                    ['title' => 'База знаний', 'duration_months' => 2, 'goals' => ['Пройти вводный курс','Сдать тест']],
                    ['title' => 'Прикладные навыки', 'duration_months' => 3, 'goals' => ['Реализовать 3 задачи','Ревью от ментора']],
                    ['title' => 'Ответственность', 'duration_months' => 4, 'goals' => ['Взять проект','Наставничество']],
                ]),
                'is_active'         => true,
                'created_by'        => $this->companyId,
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);
            $this->trackIds["{$from}→{$to}"] = $tid;
        }
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
                $first = $isMale ? $namesM[array_rand($namesM)] : $namesF[array_rand($namesF)];
                $last  = $isMale ? $surM[array_rand($surM)]  : $surF[array_rand($surF)];
                $full  = "{$first} {$last}";
                $login = sprintf('%s.%02d', $role, $i + 1);
                $email = "{$login}@demo.pikrosta.ru";
                $this->emailBook[$login] = $email;

                if (DB::table('users')->where('email', $email)->exists()) {
                    $existingId = DB::table('users')->where('email', $email)->value('id');
                    $this->userIds[$role][] = $existingId;
                    $this->allUserIds[] = $existingId;
                    $seq++;
                    continue;
                }

                try {
                    $user = $auth->createWithPassword(
                        $email,
                        $this->password,
                        $full,
                        $role,
                        companyId: $this->companyId,
                        isVerified: true,
                    );
                    $uid = (string) $user->id;
                    $this->userIds[$role][] = $uid;
                    $this->allUserIds[] = $uid;

                    // Проставим position/department/hire_date/avatar
                    $dept = array_rand($this->departmentIds);
                    $posTitle = $this->pickPositionForRole($role, $dept);
                    DB::table('profiles')->where('user_id', $uid)->update([
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
                    Log::warning("Не удалось создать демо-пользователя {$email}: " . $e->getMessage());
                    $this->warn("  ! пропущен: {$email} — " . $e->getMessage());
                }
                $seq++;
            }
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
        return $list[array_rand($list)];
    }

    // ---------- 5. managers ----------
    private function assignManagers(): void
    {
        $managers = $this->userIds['manager'] ?? [];
        $employees = $this->userIds['employee'] ?? [];
        if (!$managers || !$employees) return;

        foreach ($employees as $eid) {
            $mid = $managers[array_rand($managers)];
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
            $buyer = $this->allUserIds[array_rand($this->allUserIds)];
            $prod = $productIds[array_rand($productIds)];
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
                $tid = $tests[array_rand($tests)];
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
            $from = $this->allUserIds[array_rand($this->allUserIds)];
            $to = $this->allUserIds[array_rand($this->allUserIds)];
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
                $author = $this->allUserIds[array_rand($this->allUserIds)];
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
                'position_id'       => array_values($this->positionIds)[array_rand($this->positionIds)],
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
                    'sender_id' => $this->allUserIds[array_rand($this->allUserIds)],
                    'body' => $msgs[array_rand($msgs)],
                    'created_at' => now()->subMinutes(random_int(5, 60 * 24 * 7)),
                    'updated_at' => now(),
                ]);
            }
        }
    }
}
