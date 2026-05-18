<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Колонки impersonation_audit.actor_user_id / target_user_id были созданы как UUID (CHAR 36),
 * но в проде users.id мигрировал на integer. INSERT падает с "Data truncated".
 * Расслабляем тип до VARCHAR(64), чтобы хранить и UUID, и integer-id.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('impersonation_audit')) {
            return;
        }

        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE impersonation_audit MODIFY actor_user_id VARCHAR(64) NOT NULL');
            DB::statement('ALTER TABLE impersonation_audit MODIFY target_user_id VARCHAR(64) NOT NULL');
        } else {
            Schema::table('impersonation_audit', function (Blueprint $table) {
                $table->string('actor_user_id', 64)->change();
                $table->string('target_user_id', 64)->change();
            });
        }
    }

    public function down(): void
    {
        // no-op
    }
};
