<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * На проде users.id может быть integer, а первая миграция Sanctum создавала
 * personal_access_tokens.tokenable_id как UUID. Из-за этого createToken()
 * падал с 500 при impersonation. Делаем поле строковым для обеих схем.
 */
return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('personal_access_tokens')) {
            return;
        }

        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE personal_access_tokens MODIFY tokenable_id VARCHAR(64) NOT NULL');
        } else {
            Schema::table('personal_access_tokens', function (Blueprint $table) {
                $table->string('tokenable_id', 64)->change();
            });
        }
    }

    public function down(): void
    {
        // no-op: сужение обратно до UUID может сломать integer-id токены.
    }
};
