<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Iteration 6: Tracker module (OKR + tasks + 1:1 + audit).
 *
 * Tables:
 *  - tracker_okr_periods
 *  - tracker_goals
 *  - tracker_key_results
 *  - tracker_tasks
 *  - tracker_task_goal_links
 *  - tracker_task_checkins
 *  - tracker_one_on_ones
 *  - tracker_one_on_one_agenda
 *  - tracker_audit_log
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('tracker_okr_periods')) {
            Schema::create('tracker_okr_periods', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('name', 120);
                $t->string('kind', 16)->default('quarter'); // quarter|half_year|year|custom
                $t->date('starts_at');
                $t->date('ends_at');
                $t->boolean('is_active')->default(true);
                $t->timestamps(6);
                $t->index('company_id');
            });
        }

        if (!Schema::hasTable('tracker_goals')) {
            Schema::create('tracker_goals', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('period_id')->nullable();
                $t->uuid('holder_id');           // employee responsible
                $t->uuid('author_id');           // creator
                $t->uuid('parent_goal_id')->nullable();
                $t->uuid('team_id')->nullable();
                $t->string('title', 240);
                $t->text('description')->nullable();
                $t->string('status', 24)->default('draft'); // draft|published|needs_review|archived
                $t->decimal('progress', 5, 2)->default(0);
                $t->text('needs_review_reason')->nullable();
                $t->timestampTz('published_at', 6)->nullable();
                $t->timestampTz('archived_at', 6)->nullable();
                $t->timestamps(6);
                $t->index('company_id');
                $t->index('holder_id');
                $t->index('status');
            });
        }

        if (!Schema::hasTable('tracker_key_results')) {
            Schema::create('tracker_key_results', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('goal_id');
                $t->string('title', 240);
                $t->string('unit', 32)->default('%');
                $t->decimal('weight', 5, 2)->default(1);
                $t->decimal('start_value', 14, 2)->default(0);
                $t->decimal('current_value', 14, 2)->default(0);
                $t->decimal('target_value', 14, 2)->default(100);
                $t->integer('position')->default(0);
                $t->timestamps(6);
                $t->index('goal_id');
            });
        }

        if (!Schema::hasTable('tracker_tasks')) {
            Schema::create('tracker_tasks', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('author_id');
                $t->uuid('assignee_id');
                $t->uuid('parent_task_id')->nullable();
                $t->string('title', 240);
                $t->text('description')->nullable();
                $t->string('status', 24)->default('draft'); // draft|published|awaiting_checkin|done|orphan|needs_attention|archived
                $t->string('urgency', 16)->default('medium'); // critical|high|medium|low
                $t->timestampTz('due_at', 6)->nullable();
                $t->string('jira_key', 64)->nullable();
                $t->timestampTz('completed_at', 6)->nullable();
                $t->timestampTz('last_notified_at', 6)->nullable();
                $t->timestamps(6);
                $t->index('company_id');
                $t->index('assignee_id');
                $t->index('author_id');
                $t->index(['company_id', 'status']);
            });
        }

        if (!Schema::hasTable('tracker_task_goal_links')) {
            Schema::create('tracker_task_goal_links', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('task_id');
                $t->uuid('goal_id');
                $t->uuid('key_result_id')->nullable();
                $t->decimal('impact_weight', 5, 2)->default(1);
                $t->uuid('created_by')->nullable();
                $t->timestamps(6);
                $t->unique(['task_id', 'goal_id']);
                $t->index('task_id');
                $t->index('goal_id');
            });
        }

        if (!Schema::hasTable('tracker_task_checkins')) {
            Schema::create('tracker_task_checkins', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('task_id');
                $t->uuid('author_id');
                $t->text('note')->nullable();
                $t->string('status_to', 24)->nullable();
                $t->timestamps(6);
                $t->index('task_id');
            });
        }

        if (!Schema::hasTable('tracker_one_on_ones')) {
            Schema::create('tracker_one_on_ones', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('manager_id');
                $t->uuid('employee_id');
                $t->timestampTz('scheduled_at', 6);
                $t->integer('duration_minutes')->default(30);
                $t->string('status', 16)->default('planned'); // planned|done|cancelled
                $t->text('notes')->nullable();
                $t->text('summary')->nullable();
                $t->timestamps(6);
                $t->index('company_id');
                $t->index('manager_id');
                $t->index('employee_id');
            });
        }

        if (!Schema::hasTable('tracker_one_on_one_agenda')) {
            Schema::create('tracker_one_on_one_agenda', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('meeting_id');
                $t->string('title', 240);
                $t->text('notes')->nullable();
                $t->integer('position')->default(0);
                $t->uuid('linked_task_id')->nullable();
                $t->uuid('linked_goal_id')->nullable();
                $t->boolean('is_done')->default(false);
                $t->timestamps(6);
                $t->index('meeting_id');
            });
        }

        if (!Schema::hasTable('tracker_audit_log')) {
            Schema::create('tracker_audit_log', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->nullable();
                $t->string('entity_type', 32);
                $t->uuid('entity_id');
                $t->string('action', 32);
                $t->string('status_from', 32)->nullable();
                $t->string('status_to', 32)->nullable();
                $t->uuid('actor_id')->nullable();
                $t->json('payload')->nullable();
                $t->timestampTz('created_at', 6)->useCurrent();
                $t->index(['entity_type', 'entity_id']);
                $t->index('company_id');
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'tracker_audit_log',
            'tracker_one_on_one_agenda',
            'tracker_one_on_ones',
            'tracker_task_checkins',
            'tracker_task_goal_links',
            'tracker_tasks',
            'tracker_key_results',
            'tracker_goals',
            'tracker_okr_periods',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
