<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.achievements). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('achievements', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->text('title');
            $table->text('description')->nullable();
            $table->date('achievement_date')->nullable();
            $table->text('icon')->nullable()->default('award');
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
        });
    }
    public function down(): void { Schema::dropIfExists('achievements'); }
};
