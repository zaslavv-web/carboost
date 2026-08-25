<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * employee.76 is the canonical demo employee used in E2E checks.
 * If it has an HRD role, employee scenarios become false positives.
 */
return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('users') || ! Schema::hasTable('user_roles')) {
            return;
        }

        $userId = DB::table('users')->where('email', 'employee.76@demo.pikrosta.ru')->value('id');
        if (! $userId) {
            return;
        }

        $userId = (string) $userId;
        DB::table('user_roles')->where('user_id', $userId)->where('role', '!=', 'employee')->delete();

        if (! DB::table('user_roles')->where('user_id', $userId)->where('role', 'employee')->exists()) {
            $row = ['user_id' => $userId, 'role' => 'employee'];
            if (Schema::hasColumn('user_roles', 'id')) {
                $row['id'] = (string) Str::uuid();
            }
            if (Schema::hasColumn('user_roles', 'created_at')) $row['created_at'] = now();
            if (Schema::hasColumn('user_roles', 'updated_at')) $row['updated_at'] = now();
            DB::table('user_roles')->insert($row);
        }

        if (Schema::hasTable('profiles')) {
            DB::table('profiles')->where('user_id', $userId)->update([
                'requested_role' => 'employee',
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Data repair is intentionally irreversible.
    }
};