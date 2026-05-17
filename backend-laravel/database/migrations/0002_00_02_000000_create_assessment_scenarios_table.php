<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.assessment_scenarios). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('assessment_scenarios')) {
            Schema::create('assessment_scenarios', function (Blueprint $table) {
            $table->uuid('id');
            $table->text('title');
            $table->text('description')->nullable();
            $table->json('scenario_data')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->text('file_url')->nullable();
            $table->uuid('created_by');
            $table->boolean('is_active')->default(true);
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('assessment_scenarios'); }
};
