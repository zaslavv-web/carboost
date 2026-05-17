<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.assessments). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('assessments')) {
            Schema::create('assessments', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->text('assessment_type')->default('ai');
            $table->integer('score')->nullable()->default(0);
            $table->text('change_value')->nullable();
            $table->json('assessment_data')->nullable();
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('assessments'); }
};
