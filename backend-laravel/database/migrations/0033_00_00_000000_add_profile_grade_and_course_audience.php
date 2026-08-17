<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Грейд сотрудника в профиле (нужен для привязки обучения к грейду)
 * и сохранённые правила аудитории курса.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('profiles') && ! Schema::hasColumn('profiles', 'grade')) {
            Schema::table('profiles', function (Blueprint $t) {
                $t->string('grade', 64)->nullable()->index();
            });
        }

        if (Schema::hasTable('courses') && ! Schema::hasColumn('courses', 'audience_rules')) {
            Schema::table('courses', function (Blueprint $t) {
                $t->json('audience_rules')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('profiles') && Schema::hasColumn('profiles', 'grade')) {
            Schema::table('profiles', fn (Blueprint $t) => $t->dropColumn('grade'));
        }
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'audience_rules')) {
            Schema::table('courses', fn (Blueprint $t) => $t->dropColumn('audience_rules'));
        }
    }
};
