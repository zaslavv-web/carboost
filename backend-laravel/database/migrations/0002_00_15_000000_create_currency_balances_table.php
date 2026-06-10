<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.currency_balances). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('currency_balances')) {
            Schema::create('currency_balances', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->uuid('company_id');
            $table->integer('balance')->default(0);
            $table->timestamps(6);
            $table->primary('id');
            $table->unique(["user_id", "company_id"]);
            $table->unique(["user_id", "company_id"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('currency_balances'); }
};
