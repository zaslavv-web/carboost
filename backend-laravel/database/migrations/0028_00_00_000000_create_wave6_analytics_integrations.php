<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Волна 6: People Analytics + интеграционный слой.
 *
 * webhook_subscriptions — подписки компании на события платформы.
 *   events: JSON-массив строк-идентификаторов (leave.approved, onboarding.completed, ...)
 *   secret используется для подписи payload (HMAC-SHA256, заголовок X-GrowthPeak-Signature).
 *
 * webhook_deliveries — журнал попыток доставки (для диагностики).
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('webhook_subscriptions')) {
            Schema::create('webhook_subscriptions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('created_by')->nullable();
                $t->string('name', 160);
                $t->string('url', 500);
                $t->json('events');
                $t->string('secret', 128);
                $t->boolean('is_active')->default(true);
                $t->timestamp('last_delivery_at')->nullable();
                $t->string('last_delivery_status', 32)->nullable();
                $t->timestamps();
                $t->index(['company_id', 'is_active']);
            });
        }

        if (!Schema::hasTable('webhook_deliveries')) {
            Schema::create('webhook_deliveries', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('subscription_id');
                $t->uuid('company_id');
                $t->string('event', 96);
                $t->json('payload');
                $t->smallInteger('http_status')->nullable();
                $t->text('response_snippet')->nullable();
                $t->timestamp('delivered_at')->useCurrent();
                $t->index(['subscription_id', 'delivered_at']);
                $t->index(['company_id', 'event']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_deliveries');
        Schema::dropIfExists('webhook_subscriptions');
    }
};
