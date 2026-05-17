<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.departments). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->uuid('id');
            $table->text('name');
            $table->text('description')->nullable();
            $table->uuid('parent_id')->nullable();
            $table->uuid('head_user_id')->nullable();
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
        });
    }
    public function down(): void { Schema::dropIfExists('departments'); }
};
