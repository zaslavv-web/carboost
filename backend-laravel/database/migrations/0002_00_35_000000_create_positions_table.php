<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.positions). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('positions', function (Blueprint $table) {
            $table->uuid('id');
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('department')->nullable();
            $table->json('psychological_profile')->nullable()->default(new \Illuminate\Database\Query\Expression("('{}')"));
            $table->json('competency_profile')->nullable()->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->uuid('created_by');
            $table->uuid('company_id')->nullable();
            $table->text('profile_status')->default('draft');
            $table->integer('profile_version')->default(1);
            $table->json('profile_template')->default(new \Illuminate\Database\Query\Expression("('{}')"));
            $table->uuid('approved_by')->nullable();
            $table->timestamp('approved_at', 6)->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index('company_id');
            $table->index(["company_id", "profile_status"]);
        });
    }
    public function down(): void { Schema::dropIfExists('positions'); }
};
