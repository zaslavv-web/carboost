<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.closed_question_tests). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('closed_question_tests')) {
            Schema::create('closed_question_tests', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id')->nullable();
            $table->uuid('position_id')->nullable();
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('source_file_url')->nullable();
            $table->text('source_file_name')->nullable();
            $table->json('questions')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->boolean('is_active')->default(true);
            $table->uuid('created_by');
            $table->timestamps(6);
            $table->primary('id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('closed_question_tests'); }
};
