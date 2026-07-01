<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Волна 1: Онбординг (Модуль 2 из HRD-презентации).
 *
 *   onboarding_plans          — шаблон адаптации (role/department/position/grade/длительность)
 *   onboarding_plan_steps     — шаги шаблона (задачи, документы, обучение, встречи, чек-листы)
 *   onboarding_assignments    — назначение шаблона сотруднику (buddy, manager, start_date, статус)
 *   onboarding_step_progress  — прогресс сотрудника по каждому шагу
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('onboarding_plans')) {
            Schema::create('onboarding_plans', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('created_by')->nullable();
                $t->string('title', 200);
                $t->text('description')->nullable();
                $t->uuid('position_id')->nullable();
                $t->uuid('department_id')->nullable();
                $t->string('grade', 64)->nullable();
                $t->string('target_role', 64)->nullable(); // employee|manager|hrd
                $t->integer('duration_days')->default(90);
                $t->boolean('is_active')->default(true);
                $t->boolean('auto_assign')->default(false);
                $t->timestamps(6);
                $t->index('company_id');
                $t->index(['company_id', 'position_id']);
                $t->index(['company_id', 'department_id']);
            });
        }

        if (!Schema::hasTable('onboarding_plan_steps')) {
            Schema::create('onboarding_plan_steps', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('plan_id');
                $t->string('title', 300);
                $t->text('description')->nullable();
                // step_type: task | document | training | meeting | checklist | access
                $t->string('step_type', 32)->default('task');
                // responsible: employee | manager | buddy | hr
                $t->string('responsible', 16)->default('employee');
                // stage: pre_day1 | first_day | first_week | first_month | probation | custom
                $t->string('stage', 32)->default('first_week');
                $t->integer('order_index')->default(0);
                $t->integer('due_offset_days')->default(0); // от start_date
                $t->uuid('course_id')->nullable();       // ссылка на курс университета
                $t->text('material_url')->nullable();
                $t->text('meeting_agenda')->nullable();
                $t->boolean('is_required')->default(true);
                $t->timestamps(6);
                $t->index('company_id');
                $t->index(['plan_id', 'order_index']);
            });
        }

        if (!Schema::hasTable('onboarding_assignments')) {
            Schema::create('onboarding_assignments', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('user_id');           // адаптируемый сотрудник
                $t->uuid('plan_id');
                $t->uuid('manager_id')->nullable();
                $t->uuid('buddy_id')->nullable();
                $t->uuid('hr_id')->nullable();
                $t->date('start_date');
                $t->date('expected_end_date')->nullable();
                $t->date('actual_end_date')->nullable();
                // status: not_started | in_progress | on_hold | completed | cancelled
                $t->string('status', 32)->default('in_progress');
                $t->string('current_stage', 32)->nullable();
                $t->integer('progress_percent')->default(0);
                $t->text('notes')->nullable();
                $t->timestampTz('last_notified_at', 6)->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'status']);
                $t->index(['user_id', 'status']);
                $t->index('buddy_id');
                $t->index('manager_id');
            });
        }

        if (!Schema::hasTable('onboarding_step_progress')) {
            Schema::create('onboarding_step_progress', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('assignment_id');
                $t->uuid('step_id');
                // status: pending | in_progress | done | skipped | blocked
                $t->string('status', 16)->default('pending');
                $t->timestampTz('completed_at', 6)->nullable();
                $t->uuid('completed_by')->nullable();
                $t->text('comment')->nullable();
                $t->text('attachment_url')->nullable();
                $t->timestamps(6);
                $t->unique(['assignment_id', 'step_id']);
                $t->index('company_id');
                $t->index(['assignment_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('onboarding_step_progress');
        Schema::dropIfExists('onboarding_assignments');
        Schema::dropIfExists('onboarding_plan_steps');
        Schema::dropIfExists('onboarding_plans');
    }
};
