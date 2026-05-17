<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.shop_cart_items). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('shop_cart_items', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->uuid('company_id');
            $table->uuid('product_id');
            $table->integer('quantity')->default(1);
            $table->timestamps(6);
            $table->primary('id');
            $table->unique(["user_id", "product_id"]);
        });
    }
    public function down(): void { Schema::dropIfExists('shop_cart_items'); }
};
