<?php
/**
 * Пересбрасываем пароли тестовых пользователей в корректный bcrypt.
 * Нужно для окружений, где тестовые users уже успели создаться со старым
 * или некорректным значением password и Laravel Hash::check падал RuntimeException.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('users') || !Schema::hasColumn('users', 'password')) {
            return;
        }

        $emails = [
            'employee@test.local',
            'manager@test.local',
            'hrd@test.local',
            'admin@test.local',
            'superadmin@test.local',
        ];

        DB::table('users')
            ->whereIn('email', $emails)
            ->update([
                'password' => password_hash('password123', PASSWORD_BCRYPT),
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Не откатываем пароль: это data-fix миграция для восстановления логина.
    }
};
