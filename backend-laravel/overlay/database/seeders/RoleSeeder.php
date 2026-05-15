<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Сидирует 5 ролей в Spatie/permissions из существующего enum public.app_role.
 * Затем переносит назначения из public.user_roles в model_has_roles.
 *
 * Идемпотентен: повторный запуск не дублирует записи.
 */
class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = ['employee', 'manager', 'hrd', 'company_admin', 'superadmin'];
        $now   = now();

        foreach ($roles as $role) {
            DB::table('roles')->updateOrInsert(
                ['name' => $role, 'guard_name' => 'web'],
                ['updated_at' => $now, 'created_at' => $now]
            );
        }

        // Перенос public.user_roles → model_has_roles
        $userModel = \App\Models\User::class;

        DB::statement(<<<SQL
            INSERT INTO model_has_roles (role_id, model_type, model_id)
            SELECT r.id, '{$userModel}', ur.user_id
            FROM public.user_roles ur
            JOIN roles r ON r.name = ur.role::text AND r.guard_name = 'web'
            ON CONFLICT DO NOTHING;
        SQL);

        $this->command->info('Roles seeded and assignments synced from public.user_roles');
    }
}
