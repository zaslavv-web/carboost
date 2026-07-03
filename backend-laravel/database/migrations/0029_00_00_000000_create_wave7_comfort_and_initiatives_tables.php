<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Волна 7: предиктивный анализ комфорта работы + модуль «Инициативы сотрудников».
 *
 * comfort_scores       — интегральный индекс комфорта на трёх уровнях (user/department/company)
 *                        со суб-скорингами ToV / KPI / Career, риск-уровнем и трендом.
 * comfort_signal_events — аудит-таймлайн сигналов (для карточки сотрудника «почему такой скоринг»).
 * initiatives           — предложения сотрудников (продуктовые инициативы), сигнал для KPI-блока.
 * initiative_votes      — голоса сотрудников за инициативу.
 *
 * Гранты не нужны: Laravel-стек работает под ролью приложения, а не через PostgREST.
 * Доступ контролируется в контроллерах через has_role/company_id (как в RiskController).
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('comfort_scores')) {
            Schema::create('comfort_scores', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('scope', 16);              // company | department | user
                $t->uuid('scope_id')->nullable();     // NULL для scope=company
                $t->smallInteger('tov_score')->default(50);
                $t->smallInteger('kpi_score')->default(50);
                $t->smallInteger('career_score')->default(50);
                $t->smallInteger('comfort_index')->default(50);
                $t->string('risk_level', 16)->default('low'); // low | medium | high | critical
                $t->string('trend', 8)->default('flat');      // up | flat | down
                $t->smallInteger('trend_delta')->default(0);   // δ индекса к прошлому периоду
                $t->json('factors')->nullable();
                $t->json('recommendations')->nullable();
                $t->date('period_start');
                $t->date('period_end');
                $t->timestamp('computed_at')->useCurrent();
                $t->timestamps();
                $t->unique(['company_id', 'scope', 'scope_id', 'period_start'], 'comfort_scores_period_uk');
                $t->index(['company_id', 'scope', 'risk_level']);
                $t->index(['company_id', 'scope', 'comfort_index']);
            });
        }

        if (!Schema::hasTable('comfort_signal_events')) {
            Schema::create('comfort_signal_events', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('user_id');
                $t->uuid('company_id');
                $t->string('signal_type', 64);        // e.g. tov.chat_silence, kpi.overdue_tasks
                $t->string('source', 32);             // chat | shop | tasks | leaves | career | initiatives | ai
                $t->smallInteger('weight')->default(1);
                $t->double('value')->default(0);
                $t->string('polarity', 8)->default('neg'); // pos | neg | neu
                $t->text('note')->nullable();
                $t->timestamp('occurred_at')->useCurrent();
                $t->timestamps();
                $t->index(['user_id', 'occurred_at']);
                $t->index(['company_id', 'signal_type']);
            });
        }

        if (!Schema::hasTable('initiatives')) {
            Schema::create('initiatives', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('author_id');
                $t->string('title', 240);
                $t->text('description')->nullable();
                $t->string('category', 64)->nullable(); // product | process | culture | tech
                $t->string('status', 16)->default('new'); // new | in_review | accepted | rejected | done
                $t->smallInteger('votes_count')->default(0);
                $t->uuid('reviewer_id')->nullable();
                $t->text('review_note')->nullable();
                $t->timestamp('reviewed_at')->nullable();
                $t->timestamps();
                $t->index(['company_id', 'status']);
                $t->index(['author_id', 'created_at']);
            });
        }

        if (!Schema::hasTable('initiative_votes')) {
            Schema::create('initiative_votes', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('initiative_id');
                $t->uuid('user_id');
                $t->timestamp('created_at')->useCurrent();
                $t->unique(['initiative_id', 'user_id']);
                $t->index('user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('initiative_votes');
        Schema::dropIfExists('initiatives');
        Schema::dropIfExists('comfort_signal_events');
        Schema::dropIfExists('comfort_scores');
    }
};
