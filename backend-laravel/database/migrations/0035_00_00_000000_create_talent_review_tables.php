<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Epic D1 — Talent Review:
 *  - talent_review_sessions   — сессии калибровки (9-box / 12-box)
 *  - talent_review_ratings    — оценки Performance × Potential по сотрудникам
 *  - talent_review_notes      — протокол сессии: заметки, решения, задачи
 *  - succession_plans         — карта преемственности по должностям
 *  - succession_candidates    — преемники с уровнем готовности
 *  - talent_pool_members      — кадровый резерв (авто/ручное наполнение)
 */
return new class extends Migration {
    private function grant(string $table): void
    {
        try {
            DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$table} TO PUBLIC");
        } catch (\Throwable) {
            // MySQL/лишённые прав окружения — игнорируем.
        }
    }

    public function up(): void
    {
        if (!Schema::hasTable('talent_review_sessions')) {
            Schema::create('talent_review_sessions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->string('title', 200);
                $t->string('grid_type', 8)->default('9box');   // 9box|12box
                $t->string('status', 16)->default('draft');    // draft|in_progress|completed
                $t->uuid('cycle_id')->nullable()->index();     // performance_cycles.id
                $t->string('department', 200)->nullable();
                $t->uuid('facilitator_id')->nullable();
                $t->timestamp('scheduled_at')->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->text('protocol')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps();
            });
            $this->grant('talent_review_sessions');
        }

        if (!Schema::hasTable('talent_review_ratings')) {
            Schema::create('talent_review_ratings', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('session_id')->index();
                $t->uuid('user_id')->index();
                $t->decimal('performance_score', 5, 2)->nullable(); // сырой балл из performance
                $t->unsignedTinyInteger('perf_level')->default(2);  // 1..3 (9box) / 1..4 (12box)
                $t->unsignedTinyInteger('pot_level')->default(2);   // 1..3
                $t->unsignedTinyInteger('box')->default(5);
                $t->boolean('agreed')->default(false);
                $t->string('flight_risk', 16)->nullable();          // low|medium|high
                $t->text('note')->nullable();
                $t->uuid('rated_by')->nullable();
                $t->timestamps();
                $t->unique(['session_id', 'user_id'], 'trr_session_user_uniq');
            });
            $this->grant('talent_review_ratings');
        }

        if (!Schema::hasTable('talent_review_notes')) {
            Schema::create('talent_review_notes', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('session_id')->index();
                $t->uuid('subject_id')->nullable();   // о ком запись
                $t->string('kind', 16)->default('note'); // note|decision|action
                $t->text('body');
                $t->uuid('assignee_id')->nullable();
                $t->date('due_date')->nullable();
                $t->uuid('author_id')->nullable();
                $t->timestamps();
            });
            $this->grant('talent_review_notes');
        }

        if (!Schema::hasTable('succession_plans')) {
            Schema::create('succession_plans', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('position_id')->nullable()->index();
                $t->string('position_title', 200);
                $t->uuid('incumbent_id')->nullable();
                $t->string('criticality', 16)->default('medium'); // low|medium|high
                $t->string('risk_of_loss', 16)->default('low');   // low|medium|high
                $t->text('note')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps();
            });
            $this->grant('succession_plans');
        }

        if (!Schema::hasTable('succession_candidates')) {
            Schema::create('succession_candidates', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('plan_id')->index();
                $t->uuid('user_id')->index();
                $t->string('readiness', 16)->default('1_2_years'); // ready_now|1_2_years|3_plus
                $t->unsignedSmallInteger('rank')->default(0);
                $t->text('note')->nullable();
                $t->timestamps();
                $t->unique(['plan_id', 'user_id'], 'sc_plan_user_uniq');
            });
            $this->grant('succession_candidates');
        }

        if (!Schema::hasTable('talent_pool_members')) {
            Schema::create('talent_pool_members', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('user_id')->index();
                $t->string('pool', 24)->default('hipo'); // hipo|successor|key_talent|risk
                $t->string('source', 12)->default('manual'); // manual|auto
                $t->uuid('session_id')->nullable()->index();
                $t->unsignedTinyInteger('box')->nullable();
                $t->text('note')->nullable();
                $t->uuid('added_by')->nullable();
                $t->timestamps();
                $t->unique(['company_id', 'user_id', 'pool'], 'tpm_company_user_pool_uniq');
            });
            $this->grant('talent_pool_members');
        }
    }

    public function down(): void
    {
        foreach ([
            'talent_pool_members',
            'succession_candidates',
            'succession_plans',
            'talent_review_notes',
            'talent_review_ratings',
            'talent_review_sessions',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
