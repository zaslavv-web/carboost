<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.shop_products). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('shop_products')) {
            Schema::create('shop_products', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id');
            $table->text('title');
            $table->text('description')->nullable();
            $table->integer('price');
            $table->text('image_url')->nullable();
            $table->integer('stock')->nullable();
            $table->integer('max_per_user')->nullable();
            $table->integer('max_per_period')->nullable();
            $table->text('period_kind')->default('none');
            $table->boolean('is_active')->default(true);
            $table->uuid('created_by');
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["company_id", "is_active"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('shop_products'); }
};
