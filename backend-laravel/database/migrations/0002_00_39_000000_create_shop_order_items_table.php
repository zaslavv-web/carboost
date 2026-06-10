<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.shop_order_items). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('shop_order_items')) {
            Schema::create('shop_order_items', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('order_id');
            $table->uuid('product_id');
            $table->integer('quantity');
            $table->integer('unit_price');
            $table->integer('subtotal');
            $table->text('product_title');
            $table->timestamps(6);
            $table->primary('id');
            $table->index('order_id');
            $table->index('product_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('shop_order_items'); }
};
