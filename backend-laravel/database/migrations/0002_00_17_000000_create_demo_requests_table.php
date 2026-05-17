<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.demo_requests). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('demo_requests', function (Blueprint $table) {
            $table->uuid('id');
            $table->text('name');
            $table->text('email');
            $table->text('company')->nullable();
            $table->integer('headcount')->nullable();
            $table->text('source')->default('landing');
            $table->text('status')->default('new');
            $table->text('notes')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["status", "created_at"]);
        });
    }
    public function down(): void { Schema::dropIfExists('demo_requests'); }
};
