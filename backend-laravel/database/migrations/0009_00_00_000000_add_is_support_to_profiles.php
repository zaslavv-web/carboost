<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Добавляет флаг is_support на profiles, чтобы пользователь «Техподдержка»
 * был виден всем компаниям в чатах и получал особые права.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('profiles', 'is_support')) {
            Schema::table('profiles', function (Blueprint $table) {
                $table->boolean('is_support')->default(false);
                $table->index('is_support');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('profiles', 'is_support')) {
            Schema::table('profiles', function (Blueprint $table) {
                $table->dropIndex(['is_support']);
                $table->dropColumn('is_support');
            });
        }
    }
};
