<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Iteration 9: Scrum module (stage 4 of Jira/Trello replacement).
 *
 *  - tracker_sprints: спринты на уровне проекта
 *  - tracker_tasks.sprint_id: привязка задачи к спринту (null = бэклог)
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('tracker_sprints')) {
            Schema::create('tracker_sprints', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('project_id');
                $t->string('name', 160);
                $t->text('goal')->nullable();
                $t->string('status', 16)->default('planned'); // planned|active|completed
                $t->timestampTz('start_date', 6)->nullable();
                $t->timestampTz('end_date', 6)->nullable();
                $t->timestampTz('completed_at', 6)->nullable();
                $t->integer('position')->default(0);
                $t->timestamps(6);
                $t->index('company_id');
                $t->index(['project_id', 'status']);
            });
        }

        Schema::table('tracker_tasks', function (Blueprint $t) {
            if (!Schema::hasColumn('tracker_tasks', 'sprint_id')) {
                $t->uuid('sprint_id')->nullable()->after('project_id');
                $t->index(['sprint_id', 'order_index']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('tracker_tasks', function (Blueprint $t) {
            if (Schema::hasColumn('tracker_tasks', 'sprint_id')) {
                $t->dropColumn('sprint_id');
            }
        });
        Schema::dropIfExists('tracker_sprints');
    }
};
