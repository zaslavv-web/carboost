<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Iteration 8: Custom workflows (Jira-like) for the Tracker module.
 *
 *  - tracker_workflows                — конструктор воркфлоу на уровне компании
 *  - tracker_workflow_statuses        — статусы внутри воркфлоу
 *  - tracker_workflow_transitions     — допустимые переходы между статусами
 *  - tracker_projects.workflow_id     — какой воркфлоу использует проект
 *  - tracker_tasks.workflow_status_id — текущий пользовательский статус задачи
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('tracker_workflows')) {
            Schema::create('tracker_workflows', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('name', 120);
                $t->string('description', 500)->nullable();
                $t->boolean('is_default')->default(false);
                $t->timestamps(6);
                $t->index('company_id');
            });
        }

        if (!Schema::hasTable('tracker_workflow_statuses')) {
            Schema::create('tracker_workflow_statuses', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('workflow_id');
                $t->uuid('company_id');
                $t->string('key', 40);
                $t->string('name', 80);
                // todo | in_progress | done — для аналитики и автоматики "completed_at"
                $t->string('category', 16)->default('todo');
                $t->string('color', 16)->nullable();
                $t->integer('position')->default(0);
                $t->boolean('is_initial')->default(false);
                $t->timestamps(6);
                $t->index(['workflow_id', 'position']);
                $t->unique(['workflow_id', 'key']);
            });
        }

        if (!Schema::hasTable('tracker_workflow_transitions')) {
            Schema::create('tracker_workflow_transitions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('workflow_id');
                $t->uuid('company_id');
                // null = из любого статуса (global transition)
                $t->uuid('from_status_id')->nullable();
                $t->uuid('to_status_id');
                $t->string('name', 80);
                $t->timestamps(6);
                $t->index(['workflow_id', 'from_status_id']);
            });
        }

        Schema::table('tracker_projects', function (Blueprint $t) {
            if (!Schema::hasColumn('tracker_projects', 'workflow_id')) {
                $t->uuid('workflow_id')->nullable()->after('status');
                $t->index('workflow_id');
            }
        });

        Schema::table('tracker_tasks', function (Blueprint $t) {
            if (!Schema::hasColumn('tracker_tasks', 'workflow_status_id')) {
                $t->uuid('workflow_status_id')->nullable()->after('status');
                $t->index('workflow_status_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tracker_tasks', function (Blueprint $t) {
            if (Schema::hasColumn('tracker_tasks', 'workflow_status_id')) {
                $t->dropColumn('workflow_status_id');
            }
        });
        Schema::table('tracker_projects', function (Blueprint $t) {
            if (Schema::hasColumn('tracker_projects', 'workflow_id')) {
                $t->dropColumn('workflow_id');
            }
        });
        Schema::dropIfExists('tracker_workflow_transitions');
        Schema::dropIfExists('tracker_workflow_statuses');
        Schema::dropIfExists('tracker_workflows');
    }
};
