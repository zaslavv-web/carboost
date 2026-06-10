<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.career_level_actions). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('career_level_actions')) {
            Schema::create('career_level_actions', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('template_id');
            $table->text('action_text');
            $table->integer('action_order')->default(0);
            $table->boolean('is_required')->default(true);
            $table->text('category')->nullable()->default('skill');
            $table->timestamps(6);
            $table->primary('id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('career_level_actions'); }
};
