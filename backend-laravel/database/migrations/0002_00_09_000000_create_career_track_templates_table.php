<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.career_track_templates). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('career_track_templates')) {
            Schema::create('career_track_templates', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id')->nullable();
            $table->uuid('from_position_id')->nullable();
            $table->uuid('to_position_id')->nullable();
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('motivation_text')->nullable();
            $table->integer('estimated_months')->nullable();
            $table->json('steps')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->boolean('is_active')->default(true);
            $table->uuid('created_by');
            $table->timestamps(6);
            $table->primary('id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('career_track_templates'); }
};
