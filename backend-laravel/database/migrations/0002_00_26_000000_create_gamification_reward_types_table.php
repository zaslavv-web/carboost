<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.gamification_reward_types). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('gamification_reward_types')) {
            Schema::create('gamification_reward_types', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id')->nullable();
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('category')->default('achievement');
            $table->text('icon')->nullable()->default('award');
            $table->integer('points')->default(10);
            $table->boolean('is_active')->default(true);
            $table->uuid('created_by');
            $table->text('reward_kind')->default('achievement');
            $table->text('image_url')->nullable();
            $table->text('trigger_mode')->default('manual');
            $table->json('trigger_events')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->text('gift_content')->nullable();
            $table->text('non_monetary_title')->nullable();
            $table->text('non_monetary_description')->nullable();
            $table->decimal('monetary_amount', 12, 2)->nullable();
            $table->text('monetary_currency')->nullable()->default('RUB');
            $table->timestamps(6);
            $table->primary('id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('gamification_reward_types'); }
};
