<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.hr_task_assignees). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('hr_task_assignees', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('task_id');
            $table->uuid('user_id');
            $table->text('individual_status')->default('open');
            $table->boolean('reward_paid')->default(false);
            $table->timestamps(6);
            $table->primary('id');
            $table->unique(["task_id", "user_id"]);
            $table->index('task_id');
            $table->index('user_id');
        });
    }
    public function down(): void { Schema::dropIfExists('hr_task_assignees'); }
};
