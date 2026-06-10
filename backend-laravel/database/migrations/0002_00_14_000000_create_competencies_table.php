<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.competencies). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('competencies')) {
            Schema::create('competencies', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->text('skill_name');
            $table->integer('skill_value')->default(0);
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('competencies'); }
};
