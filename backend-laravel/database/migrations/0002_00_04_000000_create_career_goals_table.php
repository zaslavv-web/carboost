<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.career_goals). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('career_goals', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('status')->default('in_progress');
            $table->integer('progress')->default(0);
            $table->date('deadline')->nullable();
            $table->uuid('company_id')->nullable();
            $table->uuid('assignment_id')->nullable();
            $table->integer('step_order')->nullable();
            $table->boolean('auto_generated')->default(false);
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["assignment_id", "step_order"]);
            $table->index('company_id');
        });
    }
    public function down(): void { Schema::dropIfExists('career_goals'); }
};
