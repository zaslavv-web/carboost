<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Соавторы (редакторы) курса: список user_id, которым разрешено править курс. */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('courses') && ! Schema::hasColumn('courses', 'editor_ids')) {
            Schema::table('courses', function (Blueprint $t) {
                $t->json('editor_ids')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'editor_ids')) {
            Schema::table('courses', function (Blueprint $t) {
                $t->dropColumn('editor_ids');
            });
        }
    }
};
