<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.test_attempts). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('test_attempts', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id')->nullable();
            $table->uuid('user_id');
            $table->uuid('test_id')->nullable();
            $table->text('test_source')->default('hrd');
            $table->json('answers')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->json('competency_breakdown')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->integer('score')->default(0);
            $table->integer('total')->default(0);
            $table->timestamps(6);
            $table->primary('id');
        });
    }
    public function down(): void { Schema::dropIfExists('test_attempts'); }
};
