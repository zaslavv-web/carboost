<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.position_career_paths). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('position_career_paths')) {
            Schema::create('position_career_paths', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('from_position_id');
            $table->uuid('to_position_id');
            $table->text('strategy_description')->nullable();
            $table->json('requirements')->nullable()->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->integer('estimated_months')->nullable();
            $table->uuid('created_by');
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->unique(["from_position_id", "to_position_id"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('position_career_paths'); }
};
