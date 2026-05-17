<?php
/**
 * Гарантируем наличие колонок, которые ожидает сидер тестовых пользователей
 * и AuthController (meta / email_verified_at / remember_token).
 *
 * Нужно для случаев, когда таблица `users` была создана раньше (например,
 * дефолтным Laravel-стартером) и не содержит этих полей.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'meta')) {
                $table->json('meta')->nullable()->after('password');
            }
            if (!Schema::hasColumn('users', 'email_verified_at')) {
                $table->timestamp('email_verified_at', 6)->nullable()->after('email');
            }
            if (!Schema::hasColumn('users', 'remember_token')) {
                $table->string('remember_token', 100)->nullable();
            }
        });
    }

    public function down(): void
    {
        // Не откатываем — колонки могут использоваться существующими данными.
    }
};
