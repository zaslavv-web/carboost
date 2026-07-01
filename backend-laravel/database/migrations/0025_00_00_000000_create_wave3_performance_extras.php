<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Волна 3 — Performance:
 *  - performance_review_reviewers — приглашения ревьюеров для 360° (self/manager/peer/subordinate/hr)
 *  - competencies.category / target_value — Skills Matrix (текущий vs целевой уровень)
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('performance_review_reviewers')) {
            Schema::create('performance_review_reviewers', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('review_id')->index();
                $t->uuid('reviewer_id');
                $t->string('role', 24); // self|manager|peer|subordinate|hr
                $t->string('status', 16)->default('invited'); // invited|submitted|declined
                $t->uuid('invited_by')->nullable();
                $t->timestamp('invited_at')->nullable();
                $t->timestamp('submitted_at')->nullable();
                $t->text('decline_reason')->nullable();
                $t->timestamps();
                $t->unique(['review_id', 'reviewer_id', 'role']);
            });
        }

        if (Schema::hasTable('competencies')) {
            if (!Schema::hasColumn('competencies', 'category')) {
                Schema::table('competencies', fn (Blueprint $t) => $t->string('category', 64)->nullable()->index());
            }
            if (!Schema::hasColumn('competencies', 'target_value')) {
                Schema::table('competencies', fn (Blueprint $t) => $t->unsignedTinyInteger('target_value')->nullable());
            }
        }

        try { DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON performance_review_reviewers TO PUBLIC"); } catch (\Throwable) {}
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_review_reviewers');
        if (Schema::hasColumn('competencies', 'target_value')) {
            Schema::table('competencies', fn (Blueprint $t) => $t->dropColumn('target_value'));
        }
        if (Schema::hasColumn('competencies', 'category')) {
            Schema::table('competencies', fn (Blueprint $t) => $t->dropColumn('category'));
        }
    }
};
