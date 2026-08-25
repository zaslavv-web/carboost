<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Тип выдачи товара магазина и активация купленных позиций.
 *
 * material  — материальный товар: сотрудник указывает место и время получения.
 * workflow  — влияет на рабочий процесс (отгул, смена формата): формируется документ.
 * partner   — закупка у партнёра: создаётся задача ответственному сотруднику.
 * digital   — цифровой товар: активируется сразу.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('shop_products') && ! Schema::hasColumn('shop_products', 'fulfillment_kind')) {
            Schema::table('shop_products', function (Blueprint $table) {
                $table->string('fulfillment_kind', 32)->default('material');
                $table->text('fulfillment_config')->nullable();
            });
        }

        if (Schema::hasTable('shop_order_items')) {
            Schema::table('shop_order_items', function (Blueprint $table) {
                if (! Schema::hasColumn('shop_order_items', 'fulfillment_kind')) {
                    $table->string('fulfillment_kind', 32)->default('material');
                }
                if (! Schema::hasColumn('shop_order_items', 'activation_status')) {
                    $table->string('activation_status', 32)->default('pending');
                }
                if (! Schema::hasColumn('shop_order_items', 'activation_data')) {
                    $table->text('activation_data')->nullable();
                }
                if (! Schema::hasColumn('shop_order_items', 'activated_at')) {
                    $table->timestamp('activated_at', 6)->nullable();
                }
                if (! Schema::hasColumn('shop_order_items', 'fulfillment_ref_type')) {
                    $table->string('fulfillment_ref_type', 32)->nullable();
                }
                if (! Schema::hasColumn('shop_order_items', 'fulfillment_ref_id')) {
                    $table->uuid('fulfillment_ref_id')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        // Необратимо намеренно: удаление колонок уничтожило бы историю выдач.
    }
};
