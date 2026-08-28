<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Двустороннее интеграционное API (v1).
 *
 *  - api_keys                 — машинные ключи компании со скоупами
 *  - integration_events       — журнал событий платформы (курсор для pull-фида)
 *  - external_references      — соответствие «внешний ID ↔ запись платформы»
 *  - integration_idempotency  — кэш ответов по Idempotency-Key
 *
 *  + webhook_deliveries: попытки/статус/следующая попытка для ретраев
 *  + webhook_subscriptions: api_version и фильтр по ресурсам
 */
return new class extends Migration {
    private function grant(string $table): void
    {
        try {
            DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$table} TO PUBLIC");
        } catch (\Throwable) {
            // MySQL / окружения без прав — игнорируем.
        }
    }

    public function up(): void
    {
        if (!Schema::hasTable('api_keys')) {
            Schema::create('api_keys', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('name', 160);
                // Публичный префикс: по нему ключ находится за один индексный поиск,
                // сам секрет в базе не хранится — только SHA-256.
                $t->string('prefix', 16)->unique();
                $t->string('token_hash', 64);
                $t->json('scopes');                       // ["employees:read","leaves:write"]
                $t->json('ip_allowlist')->nullable();     // ["10.0.0.0/8"] | null — без ограничения
                $t->timestamp('expires_at')->nullable();
                $t->timestamp('last_used_at')->nullable();
                $t->string('last_used_ip', 45)->nullable();
                $t->timestamp('revoked_at')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps();
                $t->index(['company_id', 'revoked_at']);
            });
            $this->grant('api_keys');
        }

        if (!Schema::hasTable('integration_events')) {
            Schema::create('integration_events', function (Blueprint $t) {
                // Автоинкремент — это и есть курсор пагинации фида: строго
                // возрастающий и стабильный при параллельной записи.
                $t->bigIncrements('cursor');
                $t->uuid('id')->unique();
                $t->uuid('company_id');
                $t->string('resource', 64);               // employees, leave_requests, ...
                $t->string('event', 96);                  // employees.created
                $t->string('record_id', 64)->nullable();
                $t->json('payload');
                $t->string('actor_type', 16)->default('system'); // user|api_key|system
                $t->uuid('actor_id')->nullable();
                $t->timestamp('occurred_at')->useCurrent();
                $t->index(['company_id', 'cursor']);
                $t->index(['company_id', 'event']);
                $t->index(['company_id', 'resource', 'record_id']);
            });
            $this->grant('integration_events');
        }

        if (!Schema::hasTable('external_references')) {
            Schema::create('external_references', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('system', 64);                 // 1c_zup, sap, bitrix24, ...
                $t->string('resource', 64);
                $t->string('external_id', 190);
                $t->string('internal_id', 64);
                $t->timestamps();
                $t->unique(['company_id', 'system', 'resource', 'external_id'], 'external_refs_unique');
                $t->index(['company_id', 'resource', 'internal_id'], 'external_refs_internal');
            });
            $this->grant('external_references');
        }

        if (!Schema::hasTable('integration_idempotency')) {
            Schema::create('integration_idempotency', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('idempotency_key', 190);
                $t->string('request_hash', 64);
                $t->smallInteger('response_status');
                $t->json('response_body');
                $t->timestamp('created_at')->useCurrent();
                $t->unique(['company_id', 'idempotency_key'], 'integration_idempotency_unique');
            });
            $this->grant('integration_idempotency');
        }

        Schema::table('webhook_deliveries', function (Blueprint $t) {
            if (!Schema::hasColumn('webhook_deliveries', 'attempt')) {
                $t->smallInteger('attempt')->default(1);
            }
            if (!Schema::hasColumn('webhook_deliveries', 'status')) {
                $t->string('status', 16)->default('pending'); // pending|ok|failed|exhausted
            }
            if (!Schema::hasColumn('webhook_deliveries', 'next_attempt_at')) {
                $t->timestamp('next_attempt_at')->nullable();
            }
            if (!Schema::hasColumn('webhook_deliveries', 'event_id')) {
                $t->uuid('event_id')->nullable();
            }
        });

        Schema::table('webhook_subscriptions', function (Blueprint $t) {
            if (!Schema::hasColumn('webhook_subscriptions', 'api_version')) {
                $t->string('api_version', 8)->default('v1');
            }
            if (!Schema::hasColumn('webhook_subscriptions', 'failure_count')) {
                $t->smallInteger('failure_count')->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_idempotency');
        Schema::dropIfExists('external_references');
        Schema::dropIfExists('integration_events');
        Schema::dropIfExists('api_keys');
    }
};
