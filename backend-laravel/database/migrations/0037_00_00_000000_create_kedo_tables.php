<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Epic B2 — Модуль КЭДО (кадровый электронный документооборот):
 *  - kedo_templates              — шаблоны кадровых документов (30+ системных)
 *  - kedo_routes / _route_steps  — маршруты согласования и подписания
 *  - kedo_documents              — документы сотрудников
 *  - kedo_document_participants  — участники маршрута по конкретному документу
 *  - kedo_signatures             — ПЭП/УКЭП подписи
 *  - kedo_events                 — неизменяемый журнал с hash chain (хранение ≥ 75 лет)
 *  - kedo_edo_connections / _dispatches — каркас ГИС ЭДО (СФР/ФНС)
 */
return new class extends Migration {
    private function grant(string $table): void
    {
        try {
            DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$table} TO PUBLIC");
        } catch (\Throwable) {
            // MySQL/окружения без прав — игнорируем.
        }
    }

    public function up(): void
    {
        if (!Schema::hasTable('kedo_templates')) {
            Schema::create('kedo_templates', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->nullable()->index();
                $t->string('code', 64)->index();
                $t->string('title', 250);
                $t->string('category', 64)->default('other');
                $t->longText('body_html')->nullable();
                $t->json('placeholders')->nullable();
                $t->boolean('requires_signature')->default(true);
                $t->string('signature_kind', 8)->default('pep'); // pep|ukep|any
                $t->uuid('route_id')->nullable()->index();
                $t->unsignedSmallInteger('retention_years')->default(75);
                $t->boolean('is_system')->default(false);
                $t->boolean('is_active')->default(true);
                $t->uuid('created_by')->nullable();
                $t->timestamps();
            });
            $this->grant('kedo_templates');
        }

        if (!Schema::hasTable('kedo_routes')) {
            Schema::create('kedo_routes', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->string('title', 200);
                $t->text('description')->nullable();
                $t->boolean('is_active')->default(true);
                $t->uuid('created_by')->nullable();
                $t->timestamps();
            });
            $this->grant('kedo_routes');
        }

        if (!Schema::hasTable('kedo_route_steps')) {
            Schema::create('kedo_route_steps', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('route_id')->index();
                $t->unsignedSmallInteger('step_order')->default(1);
                $t->string('title', 200)->nullable();
                $t->string('actor_type', 16)->default('user');   // user|role|manager|subject
                $t->string('actor_ref', 128)->nullable();        // user_id или код роли
                $t->string('action', 16)->default('sign');       // approve|sign|acknowledge
                $t->unsignedSmallInteger('due_days')->default(3);
                $t->timestamps();
            });
            $this->grant('kedo_route_steps');
        }

        if (!Schema::hasTable('kedo_documents')) {
            Schema::create('kedo_documents', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('template_id')->nullable()->index();
                $t->uuid('route_id')->nullable()->index();
                $t->uuid('user_id')->index();                    // сотрудник — субъект документа
                $t->string('number', 64)->nullable();
                $t->string('title', 250);
                $t->string('category', 64)->default('other');
                $t->longText('body_html')->nullable();
                $t->string('status', 16)->default('draft');      // draft|in_review|signed|rejected|cancelled
                $t->unsignedSmallInteger('current_step')->default(1);
                $t->string('signature_kind', 8)->default('pep');
                $t->date('retention_until')->nullable();
                $t->string('file_path', 500)->nullable();
                $t->string('doc_hash', 64)->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps();
                $t->index(['company_id', 'status'], 'kedo_doc_company_status_idx');
            });
            $this->grant('kedo_documents');
        }

        if (!Schema::hasTable('kedo_document_participants')) {
            Schema::create('kedo_document_participants', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('document_id')->index();
                $t->uuid('user_id')->index();
                $t->unsignedSmallInteger('step_order')->default(1);
                $t->string('action', 16)->default('sign');       // approve|sign|acknowledge
                $t->string('status', 16)->default('pending');    // pending|done|rejected|skipped
                $t->date('due_date')->nullable();
                $t->timestamp('acted_at')->nullable();
                $t->text('comment')->nullable();
                $t->timestamps();
            });
            $this->grant('kedo_document_participants');
        }

        if (!Schema::hasTable('kedo_signatures')) {
            Schema::create('kedo_signatures', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('document_id')->index();
                $t->uuid('user_id')->index();
                $t->string('kind', 8)->default('pep');           // pep|ukep
                $t->string('otp_hash', 64)->nullable();
                $t->timestamp('otp_expires_at')->nullable();
                $t->string('cert_subject', 400)->nullable();
                $t->string('cert_serial', 128)->nullable();
                $t->string('cert_valid_to', 64)->nullable();
                $t->string('provider', 64)->nullable();          // diadoc|nobel|manual
                $t->string('sig_path', 500)->nullable();
                $t->string('ip', 64)->nullable();
                $t->string('user_agent', 400)->nullable();
                $t->string('doc_hash', 64)->nullable();
                $t->timestamp('signed_at')->nullable();
                $t->timestamps();
            });
            $this->grant('kedo_signatures');
        }

        if (!Schema::hasTable('kedo_events')) {
            Schema::create('kedo_events', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('document_id')->index();
                $t->uuid('actor_id')->nullable();
                $t->string('event', 48);
                $t->json('payload')->nullable();
                $t->string('prev_hash', 64)->nullable();
                $t->string('hash', 64);
                $t->timestamp('created_at')->nullable();
            });
            $this->grant('kedo_events');
        }

        if (!Schema::hasTable('kedo_edo_connections')) {
            Schema::create('kedo_edo_connections', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->string('provider', 32)->default('sfr');      // sfr|fns|diadoc|nobel
                $t->string('title', 200);
                $t->string('endpoint', 400)->nullable();
                $t->string('login', 200)->nullable();
                $t->text('secret')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamp('last_check_at')->nullable();
                $t->string('last_status', 32)->nullable();
                $t->timestamps();
            });
            $this->grant('kedo_edo_connections');
        }

        if (!Schema::hasTable('kedo_edo_dispatches')) {
            Schema::create('kedo_edo_dispatches', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('connection_id')->nullable()->index();
                $t->uuid('document_id')->nullable()->index();
                $t->string('status', 24)->default('queued');     // queued|sent|accepted|failed
                $t->text('message')->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->timestamps();
            });
            $this->grant('kedo_edo_dispatches');
        }
    }

    public function down(): void
    {
        foreach ([
            'kedo_edo_dispatches', 'kedo_edo_connections', 'kedo_events', 'kedo_signatures',
            'kedo_document_participants', 'kedo_documents', 'kedo_route_steps', 'kedo_routes',
            'kedo_templates',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
