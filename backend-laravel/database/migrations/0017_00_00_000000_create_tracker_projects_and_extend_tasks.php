<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Iteration 7: Tracker projects + extended task fields (Jira/Trello replacement, stage 1-2).
 *
 *  - tracker_projects (project workspace per company)
 *  - tracker_tasks gets: project_id, type, priority, story_points,
 *    estimate_minutes, labels (json), order_index, start_at
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('tracker_projects')) {
            Schema::create('tracker_projects', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('key', 16);            // e.g. PROD, MARK
                $t->string('name', 160);
                $t->text('description')->nullable();
                $t->uuid('lead_id')->nullable();
                $t->string('color', 16)->nullable();
                $t->string('icon', 32)->nullable();
                $t->string('status', 16)->default('active'); // active|archived
                $t->timestamps(6);
                $t->index('company_id');
                $t->unique(['company_id', 'key']);
            });
        }

        Schema::table('tracker_tasks', function (Blueprint $t) {
            if (!Schema::hasColumn('tracker_tasks', 'project_id')) {
                $t->uuid('project_id')->nullable()->after('company_id');
                $t->index('project_id');
            }
            if (!Schema::hasColumn('tracker_tasks', 'type')) {
                $t->string('type', 16)->default('task')->after('parent_task_id'); // epic|story|task|bug|subtask
            }
            if (!Schema::hasColumn('tracker_tasks', 'priority')) {
                $t->string('priority', 16)->nullable()->after('urgency'); // mirror of urgency, optional override
            }
            if (!Schema::hasColumn('tracker_tasks', 'story_points')) {
                $t->decimal('story_points', 6, 2)->nullable()->after('priority');
            }
            if (!Schema::hasColumn('tracker_tasks', 'estimate_minutes')) {
                $t->integer('estimate_minutes')->nullable()->after('story_points');
            }
            if (!Schema::hasColumn('tracker_tasks', 'labels')) {
                $t->json('labels')->nullable()->after('estimate_minutes');
            }
            if (!Schema::hasColumn('tracker_tasks', 'order_index')) {
                $t->integer('order_index')->default(0)->after('labels');
                $t->index(['project_id', 'status', 'order_index']);
            }
            if (!Schema::hasColumn('tracker_tasks', 'start_at')) {
                $t->timestampTz('start_at', 6)->nullable()->after('due_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tracker_tasks', function (Blueprint $t) {
            foreach (['project_id', 'type', 'priority', 'story_points', 'estimate_minutes', 'labels', 'order_index', 'start_at'] as $c) {
                if (Schema::hasColumn('tracker_tasks', $c)) {
                    $t->dropColumn($c);
                }
            }
        });
        Schema::dropIfExists('tracker_projects');
    }
};
