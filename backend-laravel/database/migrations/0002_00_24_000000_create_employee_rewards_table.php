<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.employee_rewards). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('employee_rewards')) {
            Schema::create('employee_rewards', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id')->nullable();
            $table->uuid('user_id');
            $table->uuid('reward_type_id');
            $table->timestamp('awarded_at', 6)->useCurrent();
            $table->uuid('awarded_by')->nullable();
            $table->text('description')->nullable();
            $table->timestamps(6);
            $table->primary('id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('employee_rewards'); }
};
