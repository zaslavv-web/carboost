<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Schema drift fix: many app-owned tables were created without timestamps
 * (or with only one of the two). Several code paths — most notably
 * SeedDemoCompany::assignManagers() and DbController queries ordered by
 * created_at — fail with SQLSTATE[42S22] "Unknown column 'updated_at'".
 *
 * This migration adds the missing timestamp columns idempotently. It only
 * touches app-owned tables; framework/package-owned tables
 * (cache, sessions, jobs, failed_jobs, migrations, password_reset_tokens,
 * model_has_*, role_has_permissions, personal_access_tokens, etc.)
 * are intentionally skipped — those are managed by Laravel/Spatie/Sanctum
 * and don't need timestamps for the app to work.
 */
return new class extends Migration
{
    /**
     * Tables that must have BOTH created_at and updated_at.
     * Entries omit columns that already exist thanks to hasColumn guard.
     */
    private array $needBoth = [
        'analytics_events',
        'career_step_submission_files',
        'employee_questionnaire_files',
        'impersonation_audit',
        'user_roles',
        'webhook_deliveries',
    ];

    /** Tables that need only updated_at. */
    private array $needUpdatedAt = [
        'achievements',
        'ai_usage_log',
        'assessments',
        'career_level_actions',
        'chat_message_reactions',
        'currency_transactions',
        'employee_rewards',
        'goal_checklist_items',
        'hr_task_assignees',
        'initiative_votes',
        'notifications',
        'peer_recognition_reactions',
        'peer_recognitions',
        'shop_order_items',
        'team_members',
        'test_attempts',
        'tracker_audit_log',
    ];

    /** Tables that need only created_at. */
    private array $needCreatedAt = [
        'currency_balances',
        'employee_career_assignments',
        'employee_risk_scores',
    ];

    public function up(): void
    {
        foreach ($this->needBoth as $table) {
            $this->addCreatedAt($table);
            $this->addUpdatedAt($table);
        }
        foreach ($this->needUpdatedAt as $table) {
            $this->addUpdatedAt($table);
        }
        foreach ($this->needCreatedAt as $table) {
            $this->addCreatedAt($table);
        }
    }

    public function down(): void
    {
        // Non-destructive fix — do not roll back timestamp columns.
    }

    private function addCreatedAt(string $table): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }
        if (Schema::hasColumn($table, 'created_at')) {
            return;
        }
        // Use raw SQL to guarantee MySQL DEFAULT CURRENT_TIMESTAMP semantics
        // without requiring doctrine/dbal. Backfill existing rows to NOW().
        DB::statement("ALTER TABLE `{$table}` ADD COLUMN `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
        DB::statement("UPDATE `{$table}` SET `created_at` = NOW() WHERE `created_at` IS NULL");
    }

    private function addUpdatedAt(string $table): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }
        if (Schema::hasColumn($table, 'updated_at')) {
            return;
        }
        DB::statement("ALTER TABLE `{$table}` ADD COLUMN `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
        DB::statement("UPDATE `{$table}` SET `updated_at` = COALESCE(`created_at`, NOW()) WHERE `updated_at` IS NULL");
    }
};
