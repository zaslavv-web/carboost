<?php
/**
 * Сидим 5 тестовых пользователей (по одному на каждую роль).
 * Пароль у всех одинаковый: password123 (bcrypt-хеш ниже).
 *
 * Идемпотентно: вставка пропускается, если email уже существует.
 * Все юзеры привязаны к компании по умолчанию a0000000-0000-0000-0000-000000000001
 * и сразу is_verified=1, поэтому могут логиниться без подтверждения суперадмином.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration {
    private function tableIdIsInteger(string $table): bool
    {
        $column = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE 'id'");
        return $column && str_contains(strtolower((string) $column->Type), 'int');
    }

    private function newIdFor(string $table): ?string
    {
        return $this->tableIdIsInteger($table) ? null : (string) Str::uuid();
    }

    /**
     * Дозаполняем строку значениями для всех NOT NULL колонок без default,
     * которые ещё не заданы. Это спасает, если в таблице есть legacy-поля
     * (например, `name` у дефолтной Laravel users).
     */
    private function fillRequiredColumns(string $table, array $row, array $hints = []): array
    {
        $columns = DB::select("SHOW COLUMNS FROM `{$table}`");
        foreach ($columns as $col) {
            $field = $col->Field;
            if (array_key_exists($field, $row)) continue;
            if (strtolower($col->Null) === 'yes') continue;
            if ($col->Default !== null) continue;
            if (stripos((string) $col->Extra, 'auto_increment') !== false) continue;

            if (array_key_exists($field, $hints)) {
                $row[$field] = $hints[$field];
                continue;
            }

            $type = strtolower((string) $col->Type);
            if (str_contains($type, 'int') || str_contains($type, 'decimal') || str_contains($type, 'float') || str_contains($type, 'double')) {
                $row[$field] = 0;
            } elseif (str_contains($type, 'json')) {
                $row[$field] = json_encode(new \stdClass());
            } elseif (str_contains($type, 'date') || str_contains($type, 'time')) {
                $row[$field] = now();
            } else {
                $row[$field] = '';
            }
        }
        return $row;
    }

    public function up(): void
    {
        if (!Schema::hasTable('users') || !Schema::hasTable('profiles') || !Schema::hasTable('user_roles')) {
            return;
        }

        $companyId = 'a0000000-0000-0000-0000-000000000001';
        $now = now();

        // bcrypt('password123') — генерится статически, чтобы миграция была воспроизводима
        $password = '$2b$10$kC9h5.XCE7qX/klbGvHty.2miZ2hKi.1pK3GydRUVSWO2uyleuZjq';

        $users = [
            ['email' => 'employee@test.local',    'role' => 'employee',      'full_name' => 'Тест Сотрудник',  'position' => 'Сотрудник',             'department' => 'Тестовый отдел'],
            ['email' => 'manager@test.local',     'role' => 'manager',       'full_name' => 'Тест Менеджер',   'position' => 'Линейный руководитель', 'department' => 'Тестовый отдел'],
            ['email' => 'hrd@test.local',         'role' => 'hrd',           'full_name' => 'Тест HRD',        'position' => 'HR-директор',           'department' => 'HR'],
            ['email' => 'admin@test.local',       'role' => 'company_admin', 'full_name' => 'Тест Админ',      'position' => 'Администратор',         'department' => 'Управление'],
            ['email' => 'superadmin@test.local',  'role' => 'superadmin',    'full_name' => 'Тест Суперадмин', 'position' => 'Superadmin',            'department' => ''],
        ];

        // Гарантируем наличие компании по умолчанию
        if (Schema::hasTable('companies')
            && !DB::table('companies')->where('id', $companyId)->exists()) {
            DB::table('companies')->insert([
                'id'          => $companyId,
                'name'        => 'Компания (по умолчанию)',
                'description' => 'Автоматически созданная компания',
                'created_at'  => $now,
                'updated_at'  => $now,
            ]);
        }

        foreach ($users as $u) {
            if (DB::table('users')->where('email', $u['email'])->exists()) {
                continue;
            }

            $userId = $this->newIdFor('users');

            $userRow = [
                'email'             => $u['email'],
                'password'          => $password,
                'email_verified_at' => $now,
                'meta'              => json_encode([
                    'full_name'       => $u['full_name'],
                    'company_id'      => $companyId,
                    'requested_role'  => $u['role'],
                    'email_verified'  => true,
                ], JSON_UNESCAPED_UNICODE),
                'created_at'        => $now,
                'updated_at'        => $now,
            ];

            if ($userId !== null) {
                $userRow['id'] = $userId;
            }

            $userRow = $this->fillRequiredColumns('users', $userRow, [
                'name'       => $u['full_name'],
                'full_name'  => $u['full_name'],
                'is_active'  => 1,
                'is_verified'=> 1,
            ]);

            DB::table('users')->insert($userRow);

            $userId = DB::table('users')->where('email', $u['email'])->value('id');

            $profileId = $this->newIdFor('profiles');
            $profileRow = [
                'user_id'        => $userId,
                'full_name'      => $u['full_name'],
                'position'       => $u['position'],
                'department'     => $u['department'],
                'overall_score'  => 0,
                'role_readiness' => 0,
                'is_verified'    => true,
                'requested_role' => $u['role'],
                'company_id'     => $companyId,
                'created_at'     => $now,
                'updated_at'     => $now,
            ];

            if ($profileId !== null) {
                $profileRow['id'] = $profileId;
            }

            $profileRow = $this->fillRequiredColumns('profiles', $profileRow, [
                'name'      => $u['full_name'],
                'email'     => $u['email'],
            ]);

            DB::table('profiles')->insert($profileRow);

            $roleId = $this->newIdFor('user_roles');
            $roleRow = [
                'user_id' => $userId,
                'role'    => $u['role'],
            ];

            if ($roleId !== null) {
                $roleRow['id'] = $roleId;
            }

            $roleRow = $this->fillRequiredColumns('user_roles', $roleRow);

            DB::table('user_roles')->insert($roleRow);
        }
    }

    public function down(): void
    {
        $emails = [
            'employee@test.local',
            'manager@test.local',
            'hrd@test.local',
            'admin@test.local',
            'superadmin@test.local',
        ];

        $ids = DB::table('users')->whereIn('email', $emails)->pluck('id')->all();
        if (empty($ids)) return;

        DB::table('user_roles')->whereIn('user_id', $ids)->delete();
        DB::table('profiles')->whereIn('user_id', $ids)->delete();
        DB::table('users')->whereIn('id', $ids)->delete();
    }
};
