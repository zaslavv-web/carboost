<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.employee_questionnaires). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('employee_questionnaires')) {
            Schema::create('employee_questionnaires', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->uuid('company_id')->nullable();
            $table->uuid('position_id')->nullable();
            $table->text('other_position_title')->nullable();
            $table->text('status')->default('draft');
            $table->integer('version')->default(1);
            $table->json('answers')->default(new \Illuminate\Database\Query\Expression("('{}')"));
            $table->json('skill_gaps')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->json('ai_interpretation')->nullable();
            $table->timestamp('submitted_at', 6)->nullable();
            $table->timestamp('confirmed_at', 6)->nullable();
            $table->timestamp('next_update_due_at', 6)->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["company_id", "status"]);
            $table->index(["user_id", "created_at"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('employee_questionnaires'); }
};
