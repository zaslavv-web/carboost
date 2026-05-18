<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration {
    private const EMAIL = 'zaslavv@gmail.com';

    public function up(): void
    {
        if (!Schema::hasTable('users') || !Schema::hasTable('user_roles')) {
            return;
        }

        $user = DB::table('users')->where('email', self::EMAIL)->first();
        if (!$user) {
            return;
        }

        $userId = (string) $user->id;
        if (!DB::table('user_roles')->where('user_id', $userId)->where('role', 'superadmin')->exists()) {
            $row = ['user_id' => $userId, 'role' => 'superadmin'];
            if (Schema::hasColumn('user_roles', 'id') && !$this->idColumnIsInteger('user_roles')) {
                $row['id'] = (string) Str::uuid();
            }
            DB::table('user_roles')->insert($row);
        }

        if (!Schema::hasTable('profiles')) {
            return;
        }

        $profile = DB::table('profiles')->where('user_id', $userId)->first();
        if ($profile) {
            DB::table('profiles')->where('user_id', $userId)->update([
                'is_verified' => true,
                'requested_role' => 'superadmin',
                'updated_at' => now(),
            ]);
            return;
        }

        $profileRow = [
            'user_id' => $userId,
            'full_name' => 'Superadmin',
            'is_verified' => true,
            'requested_role' => 'superadmin',
            'created_at' => now(),
            'updated_at' => now(),
        ];
        if (Schema::hasColumn('profiles', 'id') && !$this->idColumnIsInteger('profiles')) {
            $profileRow['id'] = (string) Str::uuid();
        }
        DB::table('profiles')->insert($profileRow);
    }

    public function down(): void
    {
        if (Schema::hasTable('user_roles')) {
            DB::table('user_roles')->where('role', 'superadmin')->whereIn('user_id', function ($query) {
                $query->select('id')->from('users')->where('email', self::EMAIL);
            })->delete();
        }
    }

    private function idColumnIsInteger(string $table): bool
    {
        if (DB::getDriverName() !== 'mysql') {
            return false;
        }

        try {
            $column = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE 'id'");
            return $column && str_contains(strtolower((string) $column->Type), 'int');
        } catch (\Throwable) {
            return false;
        }
    }
};