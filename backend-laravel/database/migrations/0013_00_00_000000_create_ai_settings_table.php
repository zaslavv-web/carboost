<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_settings', function (Blueprint $table) {
            $table->bigIncrements('id');
            // company_id NULL = глобальные настройки (Superadmin fallback)
            $table->uuid('company_id')->nullable()->unique();
            $table->string('provider', 32)->default('gemini');
            // gemini | yandexgpt | gigachat | openai_compatible | internal_rag | disabled
            $table->string('model', 128)->nullable();
            $table->text('api_url')->nullable();
            $table->text('api_key_enc')->nullable(); // Crypt::encryptString
            $table->json('extra')->nullable(); // folder_id, scope, temperature, max_tokens, etc.
            $table->boolean('rag_enabled')->default(false);
            $table->string('rag_index_status', 16)->default('idle'); // idle|indexing|ready|error
            $table->text('disabled_message')->nullable();
            // Порог запросов к выключенному AI, после которого админу уходит уведомление
            $table->unsignedInteger('disabled_alert_threshold')->default(10);
            $table->unsignedInteger('disabled_request_count')->default(0);
            $table->timestamp('disabled_last_alert_at')->nullable();
            $table->timestamps();
        });

        Schema::create('ai_usage_log', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('user_id')->nullable()->index();
            $table->string('feature', 64); // assessment-chat, generate-test, ...
            $table->string('provider', 32)->nullable();
            $table->boolean('was_disabled')->default(false);
            $table->unsignedInteger('latency_ms')->nullable();
            $table->string('status', 16)->nullable(); // ok|error|disabled
            $table->text('error')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_usage_log');
        Schema::dropIfExists('ai_settings');
    }
};
