<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.employee_career_assignments). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('employee_career_assignments')) {
            Schema::create('employee_career_assignments', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id')->nullable();
            $table->uuid('user_id');
            $table->uuid('template_id');
            $table->integer('current_step')->default(0);
            $table->text('personal_motivation')->nullable();
            $table->text('status')->default('active');
            $table->uuid('assigned_by')->nullable();
            $table->timestamp('assigned_at', 6)->useCurrent();
            $table->timestamps(6);
            $table->primary('id');
            $table->unique(["user_id", "template_id"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('employee_career_assignments'); }
};
