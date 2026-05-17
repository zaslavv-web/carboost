<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.shop_orders). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('shop_orders')) {
            Schema::create('shop_orders', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->uuid('company_id');
            $table->integer('total_amount');
            $table->text('status')->default('pending_fulfillment');
            $table->text('cancel_reason')->nullable();
            $table->uuid('fulfilled_by')->nullable();
            $table->timestamp('fulfilled_at', 6)->nullable();
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["company_id", "status"]);
            $table->index(["user_id", "created_at"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('shop_orders'); }
};
