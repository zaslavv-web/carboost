<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Iteration 1: Отпуска, больничные, декрет, учёба, отгулы + замещения.
 *
 * Создаёт 6 таблиц:
 *   leave_types                — справочник типов отсутствий компании
 *   leave_balances             — баланс по типу на сотрудника
 *   leave_requests             — заявки с двухступенчатым согласованием
 *   leave_request_files        — медсправки / приложения
 *   leave_compensations        — расчёт компенсации при увольнении
 *   team_member_substitutions  — временные замещения (manager-замена на период)
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('leave_types')) {
            Schema::create('leave_types', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('code', 64);                  // annual, sick_paid, sick_unpaid, maternity, study, day_off, unpaid
                $t->string('title', 200);
                $t->boolean('paid')->default(true);
                $t->decimal('accrual_days_per_year', 6, 2)->default(0);
                $t->boolean('requires_medical_cert')->default(false);
                $t->boolean('is_active')->default(true);
                $t->timestamps(6);
                $t->index('company_id');
                $t->unique(['company_id', 'code']);
            });
        }

        if (!Schema::hasTable('leave_balances')) {
            Schema::create('leave_balances', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('user_id');
                $t->uuid('company_id');
                $t->uuid('leave_type_id');
                $t->decimal('accrued_days', 6, 2)->default(0);
                $t->decimal('used_days', 6, 2)->default(0);
                $t->decimal('carryover_days', 6, 2)->default(0);
                $t->date('as_of')->nullable();
                $t->timestamps(6);
                $t->unique(['user_id', 'leave_type_id']);
                $t->index('company_id');
            });
        }

        if (!Schema::hasTable('leave_requests')) {
            Schema::create('leave_requests', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('user_id');
                $t->uuid('company_id');
                $t->uuid('leave_type_id');
                $t->date('start_date');
                $t->date('end_date');
                $t->decimal('days_count', 6, 2)->default(0);
                $t->text('reason')->nullable();
                $t->string('status', 32)->default('pending_manager');
                // workflow: pending_manager → pending_hr → approved | rejected | cancelled
                $t->uuid('manager_id')->nullable();
                $t->timestampTz('manager_decision_at', 6)->nullable();
                $t->text('manager_comment')->nullable();
                $t->uuid('hr_id')->nullable();
                $t->timestampTz('hr_decision_at', 6)->nullable();
                $t->text('hr_comment')->nullable();
                $t->uuid('substitute_user_id')->nullable();
                $t->decimal('paid_days', 6, 2)->nullable();
                $t->decimal('unpaid_days', 6, 2)->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'status']);
                $t->index(['user_id', 'status']);
            });
        }

        if (!Schema::hasTable('leave_request_files')) {
            Schema::create('leave_request_files', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('request_id');
                $t->text('file_url');
                $t->string('file_name', 255)->nullable();
                $t->uuid('uploaded_by')->nullable();
                $t->timestamps(6);
                $t->index('request_id');
            });
        }

        if (!Schema::hasTable('leave_compensations')) {
            Schema::create('leave_compensations', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('user_id');
                $t->uuid('company_id');
                $t->decimal('unused_days', 6, 2)->default(0);
                $t->decimal('daily_rate', 12, 2)->default(0);
                $t->decimal('total_amount', 14, 2)->default(0);
                $t->string('currency', 8)->default('EUR');
                $t->timestampTz('calculated_at', 6)->nullable();
                $t->timestampTz('paid_at', 6)->nullable();
                $t->uuid('calculated_by')->nullable();
                $t->text('notes')->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'user_id']);
            });
        }

        if (!Schema::hasTable('team_member_substitutions')) {
            Schema::create('team_member_substitutions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('original_user_id');
                $t->uuid('substitute_user_id');
                $t->uuid('company_id');
                $t->date('start_date');
                $t->date('end_date');
                $t->uuid('leave_request_id')->nullable();
                $t->text('notes')->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'substitute_user_id']);
                $t->index('original_user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('team_member_substitutions');
        Schema::dropIfExists('leave_compensations');
        Schema::dropIfExists('leave_request_files');
        Schema::dropIfExists('leave_requests');
        Schema::dropIfExists('leave_balances');
        Schema::dropIfExists('leave_types');
    }
};
