<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.career_step_submissions). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('career_step_submissions', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('assignment_id');
            $table->uuid('template_id');
            $table->integer('step_order');
            $table->uuid('user_id');
            $table->uuid('company_id')->nullable();
            $table->integer('attempt_no')->default(1);
            $table->boolean('is_reinforced')->default(false);
            $table->text('comment')->nullable();
            $table->uuid('test_attempt_id')->nullable();
            $table->text('status')->default('pending_review');
            $table->uuid('reviewed_by')->nullable();
            $table->timestamp('reviewed_at', 6)->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["assignment_id", "step_order"]);
            $table->index(["status", "company_id"]);
        });
    }
    public function down(): void { Schema::dropIfExists('career_step_submissions'); }
};
