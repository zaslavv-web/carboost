<?php

namespace App\Console\Commands;

use App\Services\AuthUserService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Заливает 150 пользователей в существующую компанию:
 *   1 руководитель бизнес-юнита (роль hrd) → head of БЮ
 *   30 руководителей подразделения (роль manager) → head каждого из 30 отделов
 *   119 линейных сотрудников (роль employee) → 29 отделов × 4 + 1 × 3
 *
 * Идемпотентно: --reset удаляет только строки, засеянные этой же командой
 * (маркер --marker в departments.description и users.meta.seed_marker).
 * Реальные пользователи компании не трогаются.
 *
 * На выходе — CSV в storage/app/demo-seed-150-<ts>.csv с логинами и паролями.
 */
class SeedOrg150 extends Command
{
    protected $signature = 'org:seed-150
        {--owner-email= : Email действующего company_admin/superadmin компании, куда льём}
        {--company-id= : Альтернатива: явный UUID компании}
        {--bu-name=Основной бизнес-юнит : Название родительского БЮ}
        {--departments=30 : Количество дочерних отделов}
        {--headcount=150 : Общий headcount (1 hrd + N managers + rest employees)}
        {--email-domain=demo.growth-peak.pro : Домен для сгенерированных email}
        {--marker=seed150 : Метка для идемпотентности и последующего reset}
        {--password-length=12}
        {--reset : Удалить всё, что было засеяно этой меткой, и залить заново}
        {--dry-run : Ничего не пишет, только показывает план}';

    protected $description = 'Заливает 150 демо-пользователей в существующую компанию (1 БЮ + 30 отделов).';

    private string $companyId;
    private ?string $ownerUserId = null;
    private string $marker;
    private string $emailDomain;
    private array $rowsCsv = [];

    public function handle(AuthUserService $auth): int
    {
        $this->marker      = (string) $this->option('marker');
        $this->emailDomain = (string) $this->option('email-domain');
        $deptCount         = max(1, (int) $this->option('departments'));
        $headcount         = max(2 + $deptCount, (int) $this->option('headcount'));
        $dryRun            = (bool) $this->option('dry-run');

        // ── 1. Найти компанию ────────────────────────────────────────────────
        [$this->companyId, $this->ownerUserId] = $this->resolveCompanyId();
        if ($this->companyId === '') {
            $this->error('Не удалось найти компанию. Укажи --owner-email или --company-id.');
            return self::FAILURE;
        }
        if ($this->ownerUserId === null) {
            $this->error('Не найден пользователь-владелец для created_by у позиций. Укажи --owner-email существующего company_admin/hrd компании.');
            return self::FAILURE;
        }
        $companyName = (string) DB::table('companies')->where('id', $this->companyId)->value('name');
        $this->info("Компания: {$companyName} ({$this->companyId})");

        // ── 2. Reset при необходимости ───────────────────────────────────────
        if ($this->option('reset')) {
            if ($dryRun) {
                $this->warn("[dry-run] удалил бы старые строки с меткой '{$this->marker}'");
            } else {
                $this->resetSeed();
            }
        }

        // ── 3. План ──────────────────────────────────────────────────────────
        $managerCount  = $deptCount;                                  // 30
        $employeeCount = $headcount - 1 - $managerCount;              // 119
        $baseEmp       = intdiv($employeeCount, $deptCount);          // 3
        $extraEmp      = $employeeCount - $baseEmp * $deptCount;      // 29
        $this->line("План: 1 hrd + {$managerCount} manager + {$employeeCount} employee");
        $this->line("Разбивка: {$extraEmp} отделов × " . ($baseEmp + 1) . " + " . ($deptCount - $extraEmp) . " × {$baseEmp} = {$employeeCount}");

        if ($dryRun) {
            $this->info('[dry-run] изменения не применяются.');
            return self::SUCCESS;
        }

        // ── 4. Транзакция ────────────────────────────────────────────────────
        DB::transaction(function () use ($auth, $deptCount, $baseEmp, $extraEmp) {
            $this->info('1/4  Создаю БЮ и 30 отделов…');
            [$buId, $deptIds, $deptNames] = $this->createOrgStructure($deptCount);

            $this->info('2/4  Создаю позиции…');
            [$buHeadPosId, $deptHeadPosIds, $linePosByDept] = $this->createPositions($buId, $deptIds, $deptNames);

            $this->info('3/4  Создаю пользователей…');
            [$buHeadId, $managerByDept] = $this->createUsers(
                $auth,
                $buId,
                $deptIds,
                $deptNames,
                $buHeadPosId,
                $deptHeadPosIds,
                $linePosByDept,
                $baseEmp,
                $extraEmp,
            );

            $this->info('4/4  Проставляю head_user_id и team_members…');
            DB::table('departments')->where('id', $buId)->update(['head_user_id' => $buHeadId]);
            foreach ($deptIds as $idx => $did) {
                DB::table('departments')->where('id', $did)->update(['head_user_id' => $managerByDept[$idx]['manager_id']]);
                foreach ($managerByDept[$idx]['employee_ids'] as $eid) {
                    DB::table('team_members')->insertOrIgnore([
                        'id'          => (string) Str::uuid(),
                        'company_id'  => $this->companyId,
                        'manager_id'  => $managerByDept[$idx]['manager_id'],
                        'employee_id' => $eid,
                        'created_at'  => now(),
                        'updated_at'  => now(),
                    ]);
                }
            }
        });

        // ── 5. CSV ───────────────────────────────────────────────────────────
        $ts = now()->format('Ymd-His');
        $rel = "demo-seed-150-{$ts}.csv";
        $out = "email,password,full_name,role,department,position,is_head\n";
        foreach ($this->rowsCsv as $r) {
            $out .= implode(',', array_map(fn ($v) => '"' . str_replace('"', '""', (string) $v) . '"', $r)) . "\n";
        }
        Storage::disk('local')->put($rel, $out);

        $this->info('✅ Готово.');
        $this->line("CSV с логинами/паролями: storage/app/{$rel}");
        $this->line('Первые 5 строк:');
        foreach (array_slice($this->rowsCsv, 0, 5) as $r) {
            $this->line("  {$r[0]}  {$r[1]}  {$r[2]}  {$r[3]}  {$r[4]}");
        }

        return self::SUCCESS;
    }

    // ─────────────────────────────────────────────────────────────────────────

    private function resolveCompanyId(): array
    {
        $direct = (string) $this->option('company-id');
        if ($direct !== '') {
            if (!DB::table('companies')->where('id', $direct)->exists()) {
                return ['', null];
            }
            // подберём владельца компании: company_admin → hrd → любой профиль
            $ownerId = DB::table('user_roles')
                ->join('profiles', 'profiles.user_id', '=', 'user_roles.user_id')
                ->where('profiles.company_id', $direct)
                ->whereIn('user_roles.role', ['company_admin', 'hrd'])
                ->orderByRaw("case user_roles.role when 'company_admin' then 0 when 'hrd' then 1 else 2 end")
                ->value('user_roles.user_id');
            if (!$ownerId) {
                $ownerId = DB::table('profiles')->where('company_id', $direct)->value('user_id');
            }
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

        // 1) найти все users с нашей меткой в meta
        $rawUserIds = DB::table('users')->where('meta', 'like', '%"seed_marker":"' . $this->marker . '"%')->pluck('id')->all();
        $userIds = array_map('strval', $rawUserIds);

        if ($userIds) {
            DB::table('team_members')->whereIn('manager_id', $userIds)->orWhereIn('employee_id', $userIds)->delete();
            DB::table('user_roles')->whereIn('user_id', $userIds)->delete();
            DB::table('profiles')->whereIn('user_id', $userIds)->delete();
            if (Schema::hasTable('personal_access_tokens')) {
                DB::table('personal_access_tokens')->whereIn('tokenable_id', $userIds)->delete();
            }
            // снять head_user_id, если он указывал на наших
            DB::table('departments')->where('company_id', $this->companyId)->whereIn('head_user_id', $userIds)->update(['head_user_id' => null]);
            DB::table('users')->whereIn('id', $userIds)->delete();
        }

        // 2) позиции с меткой
        DB::table('positions')->where('company_id', $this->companyId)->where('description', 'like', "%{$needle}%")->delete();

        // 3) отделы с меткой — сначала дочерние, потом БЮ
        $seedDeptIds = DB::table('departments')
            ->where('company_id', $this->companyId)
            ->where('description', 'like', "%{$needle}%")
            ->pluck('id')->all();
        if ($seedDeptIds) {
            // почистить profiles.department_id/department, ссылающиеся на удаляемые
            if (Schema::hasColumn('profiles', 'department_id')) {
                DB::table('profiles')->whereIn('department_id', $seedDeptIds)->update(['department_id' => null]);
            }
            DB::table('departments')->whereIn('id', $seedDeptIds)->delete();
        }

        $this->warn('  reset выполнен: удалено users=' . count($userIds) . ', depts=' . count($seedDeptIds));
    }

    private function createOrgStructure(int $deptCount): array
    {
        $buId = (string) Str::uuid();
        $row = [
            'id'          => $buId,
            'company_id'  => $this->companyId,
            'name'        => (string) $this->option('bu-name'),
            'description' => "Бизнес-юнит демо-набора. [{$this->marker}]",
            'created_at'  => now(),
            'updated_at'  => now(),
        ];
        if (Schema::hasColumn('departments', 'parent_id')) {
            $row['parent_id'] = null;
        }
        DB::table('departments')->insert($row);

        $bases = [
            'Продажи розницы', 'Корпоративные продажи', 'Онлайн-продажи', 'Маркетинг', 'PR и коммуникации',
            'Разработка продукта', 'Мобильная разработка', 'DevOps и инфраструктура', 'QA', 'Аналитика данных',
            'HR', 'Обучение и развитие', 'Рекрутмент', 'Финансы', 'Бухгалтерия',
            'Юридический', 'Закупки', 'Логистика', 'Клиентский сервис', 'Техподдержка',
            'Дизайн', 'UX-исследования', 'Информационная безопасность', 'IT-администрирование', 'Стратегия',
            'Продукт-менеджмент', 'Партнёрская программа', 'Международные продажи', 'B2B-развитие', 'Операционный отдел',
            'Клиентский успех', 'Внутренние коммуникации',
        ];
        $deptIds = [];
        $deptNames = [];
        for ($i = 0; $i < $deptCount; $i++) {
            $name = $bases[$i] ?? ('Отдел ' . ($i + 1));
            $did = (string) Str::uuid();
            $row = [
                'id'          => $did,
                'company_id'  => $this->companyId,
                'name'        => $name,
                'description' => "Дочерний отдел БЮ. [{$this->marker}]",
                'created_at'  => now(),
                'updated_at'  => now(),
            ];
            if (Schema::hasColumn('departments', 'parent_id')) {
                $row['parent_id'] = $buId;
            }
            DB::table('departments')->insert($row);
            $deptIds[]   = $did;
            $deptNames[] = $name;
        }

        return [$buId, $deptIds, $deptNames];
    }

    private function createPositions(string $buId, array $deptIds, array $deptNames): array
    {
        $linePositions = [
            'Специалист', 'Ведущий специалист', 'Старший специалист', 'Аналитик', 'Координатор',
        ];

        $mkPosition = function (string $title, ?string $deptName, string $note): string {
            $pid = (string) Str::uuid();
            $row = [
                'id'          => $pid,
                'company_id'  => $this->companyId,
                'title'       => $title,
                'description' => "{$note}. [{$this->marker}]",
                'created_at'  => now(),
                'updated_at'  => now(),
            ];
            if (Schema::hasColumn('positions', 'department') && $deptName !== null) {
                $row['department'] = $deptName;
            }
            if (Schema::hasColumn('positions', 'created_by')) {
                $row['created_by'] = $this->ownerUserId;
            }
            if (Schema::hasColumn('positions', 'profile_status')) {
                $row['profile_status'] = 'approved';
            }
            if (Schema::hasColumn('positions', 'profile_version')) {
                $row['profile_version'] = 1;
            }
            if (Schema::hasColumn('positions', 'competency_profile')) {
                $row['competency_profile'] = json_encode([], JSON_UNESCAPED_UNICODE);
            }
            if (Schema::hasColumn('positions', 'psychological_profile')) {
                $row['psychological_profile'] = json_encode([], JSON_UNESCAPED_UNICODE);
            }
            if (Schema::hasColumn('positions', 'profile_template')) {
                $row['profile_template'] = json_encode(new \stdClass());
            }
            DB::table('positions')->insert($row);
            return $pid;
        };

        $buHeadPosId = $mkPosition('Руководитель бизнес-юнита', null, 'Возглавляет БЮ');

        $deptHeadPosIds = [];
        foreach ($deptNames as $i => $name) {
            $deptHeadPosIds[$i] = $mkPosition("Руководитель отдела «{$name}»", $name, "Руководит отделом «{$name}»");
        }

        // линейные позиции — по 5 штук на отдел
        $linePosByDept = [];
        foreach ($deptNames as $i => $name) {
            $ids = [];
            foreach ($linePositions as $lp) {
                $ids[] = $mkPosition("{$lp}: {$name}", $name, "Линейная должность в отделе «{$name}»");
            }
            $linePosByDept[$i] = $ids;
        }

        return [$buHeadPosId, $deptHeadPosIds, $linePosByDept];
    }

    private function createUsers(
        AuthUserService $auth,
        string $buId,
        array $deptIds,
        array $deptNames,
        string $buHeadPosId,
        array $deptHeadPosIds,
        array $linePosByDept,
        int $baseEmp,
        int $extraEmp,
    ): array {
        $names = $this->russianNamePool();

        $seq = 1;
        $mkUser = function (string $role, string $deptName, ?string $deptId, string $positionTitle, string $positionId, bool $isHead) use ($auth, &$seq, $names) {
            [$first, $last] = $this->pickName($names, $seq);
            $full  = "{$first} {$last}";
            $login = $this->makeLogin($first, $last, $seq);
            $email = "{$login}@{$this->emailDomain}";
            $password = Str::password((int) $this->option('password-length'), letters: true, numbers: true, symbols: false);

            // guarantee uniqueness
            $tries = 0;
            while (DB::table('users')->where('email', $email)->exists() && $tries < 5) {
                $seq++;
                $tries++;
                $login = $this->makeLogin($first, $last, $seq);
                $email = "{$login}@{$this->emailDomain}";
            }

            $user = $auth->createWithPassword(
                $email,
                $password,
                $full,
                $role,
                companyId: $this->companyId,
                isVerified: true,
            );
            $uid = (string) $user->id;

            // пометить пользователя маркером, чтобы reset его нашёл
            $meta = DB::table('users')->where('id', $uid)->value('meta');
            $meta = is_string($meta) ? (json_decode($meta, true) ?: []) : (is_array($meta) ? $meta : []);
            $meta['seed_marker'] = $this->marker;
            $meta['full_name']   = $full;
            DB::table('users')->where('id', $uid)->update([
                'meta'       => json_encode($meta, JSON_UNESCAPED_UNICODE),
                'updated_at' => now(),
            ]);

            // profile
            $update = [
                'company_id'     => $this->companyId,
                'full_name'      => $full,
                'requested_role' => $role,
                'is_verified'    => true,
                'position'       => $positionTitle,
                'position_id'    => $positionId,
                'department'     => $deptName,
                'avatar_url'     => 'https://api.dicebear.com/9.x/thumbs/svg?seed=' . urlencode($login),
                'hire_date'      => now()->subDays(random_int(30, 1500))->toDateString(),
                'updated_at'     => now(),
            ];
            if (Schema::hasColumn('profiles', 'department_id')) {
                $update['department_id'] = $deptId;
            }
            if (Schema::hasColumn('profiles', 'overall_score')) {
                $update['overall_score'] = random_int(45, 92);
            }
            if (Schema::hasColumn('profiles', 'role_readiness')) {
                $update['role_readiness'] = random_int(30, 90);
            }
            // upsert: гарантируем наличие профиля и принудительно прописываем company_id
            $exists = DB::table('profiles')->where('user_id', $uid)->exists();
            if ($exists) {
                DB::table('profiles')->where('user_id', $uid)->update($update);
            } else {
                $insert = array_merge($update, [
                    'user_id'    => $uid,
                    'created_at' => now(),
                ]);
                if (Schema::hasColumn('profiles', 'id')) {
                    $insert['id'] = (string) Str::uuid();
                }
                DB::table('profiles')->insert($insert);
            }
            // страховка: если company_id по какой-то причине не сохранился — дожать прямым апдейтом
            DB::table('profiles')->where('user_id', $uid)->whereNull('company_id')->update([
                'company_id' => $this->companyId,
                'updated_at' => now(),
            ]);

            $this->rowsCsv[] = [$email, $password, $full, $role, $deptName, $positionTitle, $isHead ? '1' : '0'];
            $seq++;
            return $uid;
        };

        // 1) БЮ-head (hrd)
        $buHeadId = $mkUser('hrd', (string) $this->option('bu-name'), $buId, 'Руководитель бизнес-юнита', $buHeadPosId, true);

        // 2) 30 руководителей отделов + 119 линейных
        $managerByDept = [];
        foreach ($deptNames as $i => $name) {
            $mid = $mkUser('manager', $name, $deptIds[$i], "Руководитель отдела «{$name}»", $deptHeadPosIds[$i], true);
            $employeeIds = [];
            $empThisDept = $baseEmp + ($i < $extraEmp ? 1 : 0);
            for ($j = 0; $j < $empThisDept; $j++) {
                $posId = $linePosByDept[$i][$j % count($linePosByDept[$i])];
                $posTitle = (string) DB::table('positions')->where('id', $posId)->value('title');
                $employeeIds[] = $mkUser('employee', $name, $deptIds[$i], $posTitle, $posId, false);
            }
            $managerByDept[$i] = [
                'manager_id'   => $mid,
                'employee_ids' => $employeeIds,
            ];
        }

        return [$buHeadId, $managerByDept];
    }

    private function russianNamePool(): array
    {
        return [
            'first_m' => [
                'Александр','Дмитрий','Максим','Иван','Артём','Сергей','Николай','Павел','Роман','Кирилл',
                'Егор','Илья','Григорий','Андрей','Михаил','Владимир','Алексей','Евгений','Пётр','Тимофей',
                'Денис','Владислав','Антон','Юрий','Богдан','Валентин','Виктор','Геннадий','Даниил','Константин',
            ],
            'first_f' => [
                'Анна','Мария','Екатерина','Ольга','Наталья','Юлия','Виктория','Дарья','Полина','Елена',
                'Ирина','Татьяна','Алиса','Ксения','Софья','Валерия','Александра','Анастасия','Марина','Светлана',
                'Ева','Вероника','Милана','Кристина','Лариса','Людмила','Надежда','Оксана','Валентина','Галина',
            ],
            'last_m' => [
                'Иванов','Смирнов','Кузнецов','Попов','Соколов','Новиков','Морозов','Волков','Козлов','Лебедев',
                'Егоров','Павлов','Семёнов','Захаров','Никитин','Соловьёв','Борисов','Яковлев','Григорьев','Романов',
                'Воробьёв','Сергеев','Кузьмин','Фролов','Александров','Дмитриев','Королёв','Гусев','Киселёв','Ильин',
            ],
            'last_f' => [
                'Иванова','Смирнова','Кузнецова','Попова','Соколова','Новикова','Морозова','Волкова','Козлова','Лебедева',
                'Егорова','Павлова','Семёнова','Захарова','Никитина','Соловьёва','Борисова','Яковлева','Григорьева','Романова',
                'Воробьёва','Сергеева','Кузьмина','Фролова','Александрова','Дмитриева','Королёва','Гусева','Киселёва','Ильина',
            ],
        ];
    }

    private function pickName(array $pool, int $seq): array
    {
        $isMale = ($seq % 2 === 0);
        $first  = $isMale ? $pool['first_m'][($seq * 7) % count($pool['first_m'])]
                          : $pool['first_f'][($seq * 7) % count($pool['first_f'])];
        $last   = $isMale ? $pool['last_m'][($seq * 13) % count($pool['last_m'])]
                          : $pool['last_f'][($seq * 13) % count($pool['last_f'])];
        return [$first, $last];
    }

    private function makeLogin(string $first, string $last, int $seq): string
    {
        return $this->translit(mb_strtolower($first)) . '.' . $this->translit(mb_strtolower($last)) . sprintf('%03d', $seq);
    }

    private function translit(string $s): string
    {
        static $map = [
            'а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'e','ж'=>'zh','з'=>'z','и'=>'i',
            'й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t',
            'у'=>'u','ф'=>'f','х'=>'kh','ц'=>'ts','ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'',
            'э'=>'e','ю'=>'yu','я'=>'ya',' '=>'',
        ];
        return strtr($s, $map);
    }
}
