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
    public function up(): void
    {
        if (!Schema::hasTable('users') || !Schema::hasTable('profiles') || !Schema::hasTable('user_roles')) {
            return;
        }

        $companyId = 'a0000000-0000-0000-0000-000000000001';
        $now = now();

        // bcrypt('password123') — генерится статически, чтобы миграция была воспроизводима
        $password = '$2y$10$wH8QH/2pSx4hN8nQ7Z0Q1uM9rJ3kVqLrTfYpZ8hLpA2bxr3Wn1f9C';

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

            $userId = (string) Str::uuid();

            DB::table('users')->insert([
                'id'                => $userId,
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
            ]);

            DB::table('profiles')->insert([
                'id'             => (string) Str::uuid(),
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
            ]);

            DB::table('user_roles')->insert([
                'id'      => (string) Str::uuid(),
                'user_id' => $userId,
                'role'    => $u['role'],
            ]);
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
