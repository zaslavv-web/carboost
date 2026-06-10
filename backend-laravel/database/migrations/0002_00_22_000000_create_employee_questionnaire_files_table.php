<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.employee_questionnaire_files). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('employee_questionnaire_files')) {
            Schema::create('employee_questionnaire_files', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('questionnaire_id');
            $table->text('file_path');
            $table->text('file_name');
            $table->integer('file_size')->nullable();
            $table->text('file_type')->nullable();
            $table->timestamp('uploaded_at', 6)->useCurrent();
            $table->primary('id');
            $table->index('questionnaire_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('employee_questionnaire_files'); }
};
