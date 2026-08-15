<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CompanyScope фильтрует почти каждый запрос по company_id, но часть таблиц
 * создавалась без индекса на этой колонке — это full scan на каждом чтении.
 * Миграция идемпотентно добивает недостающие индексы.
 */
return new class extends Migration
{
    private array $tables = [
        'career_step_scenarios',
        'career_track_templates',
        'closed_question_tests',
        'employee_career_assignments',
        'employee_rewards',
        'gamification_reward_types',
        'goal_checklist_items',
        'notifications',
        'position_career_paths',
        'shop_cart_items',
        'support_tickets',
        'test_attempts',
        'company_branding',
        'ai_settings',
        'ai_usage_log',
        'certificates',
        'tracker_workflow_statuses',
        'tracker_workflow_transitions',
        'idp_items',
        'performance_review_reviewers',
        'portal_post_reactions',
        'portal_post_comments',
        'portal_community_members',
        'pulse_survey_questions',
        'pulse_survey_responses',
        'pulse_survey_invitees',
    ];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'company_id')) {
                continue;
            }

            $index = $table . '_company_id_index';

            try {
                if ($this->indexExists($table, $index)) {
                    continue;
                }

                Schema::table($table, function (Blueprint $t) use ($index) {
                    $t->index('company_id', $index);
                });
            } catch (\Throwable $e) {
                // индекс уже есть под другим именем или движок не дал — не валим миграцию
            }
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            $index = $table . '_company_id_index';

            try {
                if (!$this->indexExists($table, $index)) {
                    continue;
                }

                Schema::table($table, function (Blueprint $t) use ($index) {
                    $t->dropIndex($index);
                });
            } catch (\Throwable $e) {
                // ignore
            }
        }
    }

    private function indexExists(string $table, string $index): bool
    {
        return Schema::getConnection()
            ->getSchemaBuilder()
            ->getIndexes($table) !== []
            && collect(Schema::getConnection()->getSchemaBuilder()->getIndexes($table))
                ->contains(fn ($i) => ($i['name'] ?? null) === $index
                    || ($i['columns'] ?? []) === ['company_id']);
    }
};
