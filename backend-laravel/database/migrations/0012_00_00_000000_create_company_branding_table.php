<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Брендинг компании: логотип + фирменные цвета, которые применяются ко всему
 * интерфейсу для пользователей этой компании поверх базовой темы.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('company_branding')) {
            Schema::create('company_branding', function (Blueprint $table) {
                $table->uuid('company_id')->primary();
                $table->text('logo_url')->nullable();        // light theme / default
                $table->text('logo_dark_url')->nullable();   // optional dark variant
                $table->string('primary_hsl', 32)->nullable();      // "46 65% 52%"
                $table->string('primary_glow_hsl', 32)->nullable();
                $table->string('accent_hsl', 32)->nullable();
                $table->string('sidebar_bg_hsl', 32)->nullable();
                $table->boolean('auto_extracted')->default(false);
                $table->uuid('updated_by')->nullable();
                $table->timestamps(6);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('company_branding');
    }
};
