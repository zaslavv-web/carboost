<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pulse survey targeting:
 *  - pulse_survey_targets — many-to-many taggeting: department / subdivision / position / user
 *  - pulse_survey_invitees — external emails, ещё не привязанные к профилю компании
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('pulse_survey_targets')) {
            Schema::create('pulse_survey_targets', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('survey_id')->index();
                $t->string('target_type', 24); // department|subdivision|position|user
                $t->uuid('target_ref');
                $t->timestamps();
                $t->unique(['survey_id', 'target_type', 'target_ref'], 'pulse_targets_unique');
                $t->index(['company_id', 'survey_id']);
            });
        }

        if (!Schema::hasTable('pulse_survey_invitees')) {
            Schema::create('pulse_survey_invitees', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('survey_id')->index();
                $t->string('email');
                $t->string('status', 16)->default('pending'); // pending|invited|resolved
                $t->uuid('resolved_user_id')->nullable();
                $t->timestamps();
                $t->unique(['survey_id', 'email'], 'pulse_invitees_unique');
            });
        }

        foreach (['pulse_survey_targets', 'pulse_survey_invitees'] as $tbl) {
            try {
                DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$tbl} TO PUBLIC");
            } catch (\Throwable) {
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pulse_survey_invitees');
        Schema::dropIfExists('pulse_survey_targets');
    }
};
