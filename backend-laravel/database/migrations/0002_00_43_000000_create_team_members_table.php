<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.team_members). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('team_members')) {
            Schema::create('team_members', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('manager_id');
            $table->uuid('employee_id');
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
            $table->unique(["manager_id", "employee_id"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('team_members'); }
};
