<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.profiles). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('profiles')) {
            Schema::create('profiles', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->text('full_name')->default('');
            $table->text('position')->nullable()->default('');
            $table->text('department')->nullable()->default('');
            $table->text('avatar_url')->nullable();
            $table->date('hire_date')->nullable();
            $table->integer('overall_score')->nullable()->default(0);
            $table->integer('role_readiness')->nullable()->default(0);
            $table->boolean('is_verified')->default(false);
            $table->text('requested_role')->default('employee');
            $table->uuid('position_id')->nullable();
            $table->uuid('company_id')->nullable();
            $table->uuid('pending_position_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
            $table->unique('user_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('profiles'); }
};
