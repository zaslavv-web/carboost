<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.company_onboarding_settings). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('company_onboarding_settings', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id');
            $table->boolean('auto_assign_tests')->default(true);
            $table->boolean('auto_assign_tracks')->default(true);
            $table->boolean('welcome_bonus_enabled')->default(true);
            $table->integer('welcome_bonus_amount')->default(100);
            $table->timestamps(6);
            $table->primary('id');
            $table->unique('company_id');
        });
    }
    public function down(): void { Schema::dropIfExists('company_onboarding_settings'); }
};
