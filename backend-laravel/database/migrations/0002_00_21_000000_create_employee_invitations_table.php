<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.employee_invitations). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('employee_invitations')) {
            Schema::create('employee_invitations', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id');
            $table->text('email');
            $table->text('full_name')->nullable();
            $table->uuid('position_id')->nullable();
            $table->text('department')->nullable();
            $table->text('requested_role')->default('employee');
            $table->text('status')->default('pending');
            $table->uuid('invited_by');
            $table->uuid('claimed_user_id')->nullable();
            $table->timestamp('claimed_at', 6)->nullable();
            $table->text('token');
            $table->text('token_hash')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('token_hash');
            $table->unique('company_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('employee_invitations'); }
};
