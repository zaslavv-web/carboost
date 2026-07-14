<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Schema drift fix: `hr_documents.created_by` and
 * `career_track_templates.created_by` were declared NOT NULL without a
 * DEFAULT, but the generic DbController writes rows via the Query
 * Builder and therefore cannot rely on Eloquent auto-fill. Prod INSERTs
 * fail with SQLSTATE[HY000] 1364 "Field 'created_by' doesn't have a
 * default value".
 *
 * We relax the column to NULLABLE. Application code that has an actor
 * still writes the value; anonymous imports (seeder / bulk) proceed.
 * Idempotent: safe to re-run.
 */
return new class extends Migration
{
    private array $tables = ['hr_documents', 'career_track_templates'];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'created_by')) {
                continue;
            }
            // Works on MySQL 5.7+/8. UUID/char columns keep their length via CHAR(36).
            try {
                DB::statement("ALTER TABLE `{$table}` MODIFY `created_by` CHAR(36) NULL DEFAULT NULL");
            } catch (\Throwable $e) {
                // Fallback: try generic MODIFY without length (bigint/uuid variants).
                DB::statement("ALTER TABLE `{$table}` MODIFY `created_by` VARCHAR(64) NULL DEFAULT NULL");
            }
        }
    }

    public function down(): void
    {
        // no-op — we don't want to re-introduce the NOT NULL constraint that
        // caused the incident.
    }
};
