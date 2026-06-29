<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Поля для авто-доставки модулей продукта:
 *  - courses.position_ids               — список должностей, кому курс обязателен (авто-зачисление)
 *  - gamification_reward_types.psych_traits — психо-черты, при совпадении с профилем активируется награда
 *  - employee_risk_scores.alerted_at    — последний раз, когда отправили алерт по этому риску
 *  - employee_risk_scores.previous_level — для детекции перехода low/medium → high
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('courses') && ! Schema::hasColumn('courses', 'position_ids')) {
            Schema::table('courses', function (Blueprint $t) {
                $t->json('position_ids')->nullable();
            });
        }

        if (Schema::hasTable('gamification_reward_types') && ! Schema::hasColumn('gamification_reward_types', 'psych_traits')) {
            Schema::table('gamification_reward_types', function (Blueprint $t) {
                $t->json('psych_traits')->nullable();
            });
        }

        if (Schema::hasTable('employee_risk_scores')) {
            Schema::table('employee_risk_scores', function (Blueprint $t) {
                if (! Schema::hasColumn('employee_risk_scores', 'alerted_at')) {
                    $t->timestamp('alerted_at', 6)->nullable();
                }
                if (! Schema::hasColumn('employee_risk_scores', 'previous_level')) {
                    $t->string('previous_level', 16)->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'position_ids')) {
            Schema::table('courses', fn (Blueprint $t) => $t->dropColumn('position_ids'));
        }
        if (Schema::hasTable('gamification_reward_types') && Schema::hasColumn('gamification_reward_types', 'psych_traits')) {
            Schema::table('gamification_reward_types', fn (Blueprint $t) => $t->dropColumn('psych_traits'));
        }
        if (Schema::hasTable('employee_risk_scores')) {
            Schema::table('employee_risk_scores', function (Blueprint $t) {
                if (Schema::hasColumn('employee_risk_scores', 'alerted_at')) $t->dropColumn('alerted_at');
                if (Schema::hasColumn('employee_risk_scores', 'previous_level')) $t->dropColumn('previous_level');
            });
        }
    }
};
