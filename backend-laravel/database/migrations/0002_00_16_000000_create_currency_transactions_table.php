<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.currency_transactions). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('currency_transactions')) {
            Schema::create('currency_transactions', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->uuid('company_id');
            $table->integer('amount');
            $table->text('kind');
            $table->uuid('reference_id')->nullable();
            $table->text('description')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["company_id", "created_at"]);
            $table->index(["user_id", "created_at"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('currency_transactions'); }
};
