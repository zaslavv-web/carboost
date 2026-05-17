<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.career_step_submission_files). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('career_step_submission_files')) {
            Schema::create('career_step_submission_files', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('submission_id');
            $table->text('file_url');
            $table->text('file_name')->nullable();
            $table->integer('file_size')->nullable();
            $table->timestamp('uploaded_at', 6)->useCurrent();
            $table->primary('id');
            $table->index('submission_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('career_step_submission_files'); }
};
