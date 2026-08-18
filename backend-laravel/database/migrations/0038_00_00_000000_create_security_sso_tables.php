<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Epic B3 — SSO и корпоративная безопасность.
 *  - sso_providers      : SAML 2.0 / OIDC подключения компании
 *  - scim_tokens        : токены SCIM 2.0 для автопровижининга
 *  - user_two_factor    : TOTP-секреты и резервные коды
 *  - security_policies  : conditional access (2FA по ролям, IP-allowlist, SIEM)
 *  - security_audit_log : журнал событий безопасности
 *  - custom_roles / custom_role_user : кастомные RBAC-роли
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('sso_providers')) {
            Schema::create('sso_providers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('kind', 16)->default('oidc');       // saml | oidc
                $table->string('title', 200)->default('');
                $table->string('domain_hint', 190)->nullable();     // корпоративный домен почты
                $table->boolean('is_active')->default(true);
                $table->boolean('jit_provisioning')->default(true);
                $table->string('default_role', 32)->default('employee');
                // SAML
                $table->string('entity_id', 500)->nullable();
                $table->string('sso_url', 500)->nullable();
                $table->string('slo_url', 500)->nullable();
                $table->text('x509_cert')->nullable();
                // OIDC
                $table->string('issuer', 500)->nullable();
                $table->string('authorize_url', 500)->nullable();
                $table->string('token_url', 500)->nullable();
                $table->string('userinfo_url', 500)->nullable();
                $table->string('client_id', 300)->nullable();
                $table->text('client_secret')->nullable();
                $table->string('scopes', 300)->nullable()->default('openid email profile');
                $table->timestamp('last_login_at')->nullable();
                $table->string('created_by')->nullable();
                $table->timestamps(6);

                $table->index('company_id');
                $table->index('domain_hint');
            });
        }

        if (!Schema::hasTable('scim_tokens')) {
            Schema::create('scim_tokens', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('name', 200)->default('SCIM');
                $table->string('token_hash', 128);
                $table->string('token_prefix', 16)->default('');
                $table->boolean('is_active')->default(true);
                $table->timestamp('last_used_at')->nullable();
                $table->string('created_by')->nullable();
                $table->timestamps(6);

                $table->index('company_id');
                $table->index('token_hash');
            });
        }

        if (!Schema::hasTable('user_two_factor')) {
            Schema::create('user_two_factor', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('user_id')->unique();
                $table->string('secret', 64);
                $table->boolean('enabled')->default(false);
                $table->text('backup_codes')->nullable();   // json: массив хэшей
                $table->timestamp('confirmed_at')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamps(6);
            });
        }

        if (!Schema::hasTable('security_policies')) {
            Schema::create('security_policies', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->unique();
                $table->text('require_2fa_roles')->nullable();      // json: ["hrd","company_admin"]
                $table->text('ip_allowlist')->nullable();           // json: ["1.2.3.0/24"]
                $table->unsignedInteger('session_timeout_minutes')->default(0);
                $table->unsignedInteger('password_min_length')->default(8);
                $table->boolean('sso_only')->default(false);
                $table->string('siem_webhook_url', 500)->nullable();
                $table->string('siem_format', 16)->default('json'); // json | cef
                $table->timestamps(6);
            });
        }

        if (!Schema::hasTable('security_audit_log')) {
            Schema::create('security_audit_log', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('user_id')->nullable();
                $table->string('actor_email', 190)->nullable();
                $table->string('event', 64);                        // login.success, sso.login, 2fa.enabled ...
                $table->string('category', 32)->default('auth');    // auth | access | data | admin
                $table->string('severity', 16)->default('info');    // info | warning | critical
                $table->string('target_type', 64)->nullable();
                $table->string('target_id', 64)->nullable();
                $table->string('ip', 64)->nullable();
                $table->string('user_agent', 300)->nullable();
                $table->text('payload')->nullable();
                $table->timestamp('created_at')->nullable();

                $table->index(['company_id', 'created_at']);
                $table->index('event');
                $table->index('user_id');
            });
        }

        if (!Schema::hasTable('custom_roles')) {
            Schema::create('custom_roles', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('code', 64);
                $table->string('title', 200);
                $table->string('description', 500)->nullable();
                $table->string('base_role', 32)->default('employee');
                $table->text('permissions')->nullable();            // json: ["employees.read", ...]
                $table->boolean('is_active')->default(true);
                $table->string('created_by')->nullable();
                $table->timestamps(6);

                $table->index('company_id');
            });
        }

        if (!Schema::hasTable('custom_role_user')) {
            Schema::create('custom_role_user', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->uuid('custom_role_id');
                $table->string('user_id');
                $table->string('assigned_by')->nullable();
                $table->timestamps(6);

                $table->unique(['custom_role_id', 'user_id']);
                $table->index('user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_role_user');
        Schema::dropIfExists('custom_roles');
        Schema::dropIfExists('security_audit_log');
        Schema::dropIfExists('security_policies');
        Schema::dropIfExists('user_two_factor');
        Schema::dropIfExists('scim_tokens');
        Schema::dropIfExists('sso_providers');
    }
};
