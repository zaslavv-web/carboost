<?php
namespace Database\Seeders;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

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
        $this->command->info('Roles seeded successfully');
    }
}
