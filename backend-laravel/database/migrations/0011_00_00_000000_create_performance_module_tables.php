<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Iteration 2: Performance Reviews + Probation + PIP/Disciplinary + 1:1.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('performance_cycles')) {
            Schema::create('performance_cycles', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('title', 200);
                $t->date('period_start');
                $t->date('period_end');
                $t->date('deadline')->nullable();
                $t->string('status', 32)->default('draft');
                $t->json('weights')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps(6);
                $t->index('company_id');
            });
        }

        if (!Schema::hasTable('performance_reviews')) {
            Schema::create('performance_reviews', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('cycle_id');
                $t->uuid('user_id');
                $t->uuid('company_id');
                $t->uuid('manager_id')->nullable();
                $t->string('status', 32)->default('draft');
                $t->decimal('self_score', 5, 2)->nullable();
                $t->decimal('manager_score', 5, 2)->nullable();
                $t->decimal('peer_score', 5, 2)->nullable();
                $t->decimal('final_score', 5, 2)->nullable();
                $t->text('summary')->nullable();
                $t->timestampTz('finalized_at', 6)->nullable();
                $t->timestamps(6);
                $t->unique(['cycle_id', 'user_id']);
                $t->index(['company_id', 'status']);
                $t->index(['user_id', 'status']);
            });
        }

        if (!Schema::hasTable('performance_review_feedback')) {
            Schema::create('performance_review_feedback', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('review_id');
                $t->uuid('reviewer_id');
                $t->string('role', 24);
                $t->json('competency_scores')->nullable();
                $t->decimal('overall_score', 5, 2)->nullable();
                $t->text('strengths')->nullable();
                $t->text('improvements')->nullable();
                $t->text('comments')->nullable();
                $t->timestampTz('submitted_at', 6)->nullable();
                $t->timestamps(6);
                $t->unique(['review_id', 'reviewer_id', 'role']);
                $t->index('review_id');
            });
        }

        if (!Schema::hasTable('probation_periods')) {
            Schema::create('probation_periods', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('user_id');
                $t->uuid('company_id');
                $t->uuid('manager_id')->nullable();
                $t->uuid('hr_id')->nullable();
                $t->date('start_date');
                $t->date('end_date');
                $t->date('extended_to')->nullable();
                $t->string('status', 24)->default('active');
                $t->timestampTz('decision_at', 6)->nullable();
                $t->uuid('decision_by')->nullable();
                $t->text('decision_notes')->nullable();
                $t->text('goals')->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'status']);
                $t->index('user_id');
            });
        }

        if (!Schema::hasTable('probation_criteria')) {
            Schema::create('probation_criteria', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('probation_id');
                $t->string('title', 255);
                $t->text('description')->nullable();
                $t->decimal('weight', 5, 2)->default(1);
                $t->boolean('is_met')->default(false);
                $t->timestampTz('met_at', 6)->nullable();
                $t->uuid('marked_by')->nullable();
                $t->text('comment')->nullable();
                $t->timestamps(6);
                $t->index('probation_id');
            });
        }

        if (!Schema::hasTable('disciplinary_records')) {
            Schema::create('disciplinary_records', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('user_id');
                $t->uuid('company_id');
                $t->string('type', 24);
                $t->string('severity', 16)->default('medium');
                $t->uuid('issued_by')->nullable();
                $t->timestampTz('issued_at', 6)->nullable();
                $t->date('valid_until')->nullable();
                $t->text('reason');
                $t->string('status', 16)->default('active');
                $t->timestampTz('closed_at', 6)->nullable();
                $t->uuid('closed_by')->nullable();
                $t->text('closure_reason')->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'status']);
                $t->index(['user_id', 'type']);
            });
        }

        if (!Schema::hasTable('disciplinary_criteria')) {
            Schema::create('disciplinary_criteria', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('record_id');
                $t->string('title', 255);
                $t->text('description')->nullable();
                $t->boolean('is_met')->default(false);
                $t->timestampTz('met_at', 6)->nullable();
                $t->uuid('marked_by')->nullable();
                $t->text('evidence_url')->nullable();
                $t->text('comment')->nullable();
                $t->timestamps(6);
                $t->index('record_id');
            });
        }

        if (!Schema::hasTable('one_on_one_meetings')) {
            Schema::create('one_on_one_meetings', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('manager_id');
                $t->uuid('employee_id');
                $t->uuid('company_id');
                $t->timestampTz('scheduled_at', 6);
                $t->integer('duration_min')->default(30);
                $t->string('status', 16)->default('scheduled');
                $t->text('agenda')->nullable();
                $t->text('notes')->nullable();
                $t->string('related_type', 32)->nullable();
                $t->uuid('related_id')->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'status']);
                $t->index(['manager_id', 'scheduled_at']);
                $t->index(['employee_id', 'scheduled_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('one_on_one_meetings');
        Schema::dropIfExists('disciplinary_criteria');
        Schema::dropIfExists('disciplinary_records');
        Schema::dropIfExists('probation_criteria');
        Schema::dropIfExists('probation_periods');
        Schema::dropIfExists('performance_review_feedback');
        Schema::dropIfExists('performance_reviews');
        Schema::dropIfExists('performance_cycles');
    }
};
