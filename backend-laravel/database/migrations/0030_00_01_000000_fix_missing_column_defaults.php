<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Schema drift fix #2: some tables were created on prod without the
 * DEFAULT clauses declared in the original migration, so INSERTs that
 * rely on defaults (e.g. SeedDemoCompany) fail with
 * SQLSTATE[HY000] 1364 "Field '...' doesn't have a default value".
 *
 * We re-apply the intended DEFAULT + NOT NULL to app-owned columns.
 * Idempotent: ALTER ... SET DEFAULT is safe to re-run.
 */
return new class extends Migration
{
    /** [table => [column => "TYPE NOT NULL DEFAULT ..."]] */
    private array $fixes = [
        'company_onboarding_settings' => [
            'auto_assign_tests'     => ['TINYINT(1) NOT NULL DEFAULT 1', '1'],
            'auto_assign_tracks'    => ['TINYINT(1) NOT NULL DEFAULT 1', '1'],
            'welcome_bonus_enabled' => ['TINYINT(1) NOT NULL DEFAULT 1', '1'],
            'welcome_bonus_amount'  => ['INT NOT NULL DEFAULT 100', '100'],
        ],
    ];

    public function up(): void
    {
        foreach ($this->fixes as $table => $cols) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            foreach ($cols as $col => $definition) {
                if (!Schema::hasColumn($table, $col)) {
                    continue;
                }
                // Backfill NULLs before enforcing NOT NULL.
                DB::statement("UPDATE `{$table}` SET `{$col}` = DEFAULT(`{$col}`) WHERE `{$col}` IS NULL");
                DB::statement("ALTER TABLE `{$table}` MODIFY `{$col}` {$definition}");
            }
        }
    }

    public function down(): void
    {
        // Non-destructive fix.
    }
};
