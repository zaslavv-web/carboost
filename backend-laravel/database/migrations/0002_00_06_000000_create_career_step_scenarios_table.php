<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.career_step_scenarios). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('career_step_scenarios')) {
            Schema::create('career_step_scenarios', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('template_id');
            $table->integer('step_order');
            $table->uuid('company_id')->nullable();
            $table->boolean('requires_test')->default(true);
            $table->uuid('test_id')->nullable();
            $table->integer('min_test_score')->default(80);
            $table->boolean('requires_files')->default(true);
            $table->integer('min_files')->default(1);
            $table->boolean('requires_comment')->default(true);
            $table->text('instructions')->nullable();
            $table->text('reinforced_instructions')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->unique(["template_id", "step_order"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('career_step_scenarios'); }
};
