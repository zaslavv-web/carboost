<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Динамическая аудитория HR-задач: отделы / должности / грейды.
 * Задача остаётся привязанной к правилу, исполнители досоздаются автоматически.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('hr_tasks') && ! Schema::hasColumn('hr_tasks', 'audience_rules')) {
            Schema::table('hr_tasks', function (Blueprint $t) {
                $t->json('audience_rules')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('hr_tasks') && Schema::hasColumn('hr_tasks', 'audience_rules')) {
            Schema::table('hr_tasks', fn (Blueprint $t) => $t->dropColumn('audience_rules'));
        }
    }
};
