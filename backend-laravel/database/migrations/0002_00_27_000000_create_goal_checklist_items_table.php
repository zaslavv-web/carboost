<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.goal_checklist_items). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('goal_checklist_items', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('goal_id');
            $table->text('text');
            $table->boolean('is_done')->default(false);
            $table->date('deadline')->nullable();
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
        });
    }
    public function down(): void { Schema::dropIfExists('goal_checklist_items'); }
};
