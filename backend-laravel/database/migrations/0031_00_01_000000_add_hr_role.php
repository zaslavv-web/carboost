<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the "hr" role (subordinate to HRD). Permission-wise HR = HRD;
 * they are separated only by dashboard/label and org position.
 *
 *  - On Postgres: widen the legacy `public.app_role` enum with "hr".
 *  - On any driver: seed the Spatie `roles` table so middleware/guards work.
 */
return new class extends Migration {
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement("ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr'");
            } catch (\Throwable $e) {
                // enum missing or already contains the value — ignore
            }
        }

        if (Schema::hasTable('roles')) {
            $exists = DB::table('roles')
                ->where('name', 'hr')
                ->where('guard_name', 'web')
                ->exists();
            if (! $exists) {
                DB::table('roles')->insert([
                    'name'       => 'hr',
                    'guard_name' => 'web',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('roles')) {
            DB::table('roles')->where('name', 'hr')->where('guard_name', 'web')->delete();
        }
        // Postgres enum values cannot be dropped safely — leave "hr" in place.
    }
};
