<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Iteration 11:
 *  - profiles.chat_sticker_url — личная картинка сотрудника для вставки в чаты
 *  - gamification_levels       — настраиваемые уровни геймификации per company
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('profiles') && !Schema::hasColumn('profiles', 'chat_sticker_url')) {
            Schema::table('profiles', function (Blueprint $t) {
                $t->text('chat_sticker_url')->nullable();
            });
        }

        if (!Schema::hasTable('gamification_levels')) {
            Schema::create('gamification_levels', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->integer('order')->default(1);
                $t->string('title', 120);
                $t->string('icon', 64)->default('star');
                $t->string('color', 32)->default('#22c55e');
                $t->integer('min_points')->default(0);
                $t->integer('min_tenure_months')->default(0);
                $t->integer('min_achievements')->default(0);
                $t->text('description')->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'order']);
                $t->unique(['company_id', 'order']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('gamification_levels');
        if (Schema::hasTable('profiles') && Schema::hasColumn('profiles', 'chat_sticker_url')) {
            Schema::table('profiles', function (Blueprint $t) {
                $t->dropColumn('chat_sticker_url');
            });
        }
    }
};
