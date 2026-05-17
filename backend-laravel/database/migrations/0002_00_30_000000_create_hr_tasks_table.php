<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.hr_tasks). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('hr_tasks', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id');
            $table->uuid('created_by');
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('category')->default('collaboration');
            $table->integer('reward_coins')->default(0);
            $table->date('deadline')->nullable();
            $table->text('status')->default('open');
            $table->uuid('reviewed_by')->nullable();
            $table->timestamp('reviewed_at', 6)->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["company_id", "status"]);
            $table->index('created_by');
        });
    }
    public function down(): void { Schema::dropIfExists('hr_tasks'); }
};
