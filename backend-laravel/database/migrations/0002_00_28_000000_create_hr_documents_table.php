<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.hr_documents). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('hr_documents')) {
            Schema::create('hr_documents', function (Blueprint $table) {
            $table->uuid('id');
            $table->text('document_type');
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('file_url')->nullable();
            $table->text('file_name')->nullable();
            $table->text('processing_status')->default('pending');
            $table->json('extracted_data')->nullable();
            $table->uuid('scenario_id')->nullable();
            $table->uuid('created_by');
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('hr_documents'); }
};
