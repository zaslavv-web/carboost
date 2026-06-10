<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.company_currency_settings). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('company_currency_settings')) {
            Schema::create('company_currency_settings', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id');
            $table->text('currency_name')->default('Монеты');
            $table->text('currency_icon')->default('🪙');
            $table->timestamps(6);
            $table->primary('id');
            $table->unique('company_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('company_currency_settings'); }
};
