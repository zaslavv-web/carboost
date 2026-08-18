<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Epic B1 — Интеграция с 1С:ЗУП 8.3.
 *
 *  - integration_connections    — подключения (OData/EnterpriseData), учётки, опции
 *  - integration_field_mappings — маппинг полей источник → платформа
 *  - integration_sync_runs      — запуски синхронизации (журнал)
 *  - integration_sync_records   — построчный результат с ошибками и retry
 *  - payroll_entries            — начисления/удержания из 1С:ЗУП
 *
 *  + external_id на profiles / departments / positions для идемпотентного upsert.
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
        if (!Schema::hasTable('integration_connections')) {
            Schema::create('integration_connections', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->string('provider', 32)->default('1c_zup');   // 1c_zup
                $t->string('name', 200);
                $t->string('base_url', 500)->nullable();          // http://server/base/odata/standard.odata
                $t->string('auth_type', 16)->default('basic');    // basic|none
                $t->string('username', 200)->nullable();
                $t->text('secret')->nullable();                   // пароль (шифруется на уровне приложения)
                $t->boolean('is_active')->default(true);
                $t->boolean('verify_tls')->default(true);
                $t->json('options')->nullable();                  // {entities:[], schedule:'daily', dry_run:bool}
                $t->timestamp('last_sync_at')->nullable();
                $t->string('last_status', 16)->nullable();        // success|partial|failed
                $t->text('last_error')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps();
            });
            $this->grant('integration_connections');
        }

        if (!Schema::hasTable('integration_field_mappings')) {
            Schema::create('integration_field_mappings', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('connection_id')->nullable()->index();
                $t->string('entity', 32);            // employee|department|position|payroll
                $t->string('source_field', 200);     // поле 1С / колонка файла
                $t->string('target_field', 100);     // поле платформы
                $t->string('transform', 32)->nullable(); // trim|upper|lower|date|number|bool
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->index(['company_id', 'entity']);
            });
            $this->grant('integration_field_mappings');
        }

        if (!Schema::hasTable('integration_sync_runs')) {
            Schema::create('integration_sync_runs', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('connection_id')->nullable()->index();
                $t->string('entity', 32);                       // employee|department|position|payroll
                $t->string('source', 16)->default('file');      // file|odata
                $t->string('status', 16)->default('running');   // running|success|partial|failed
                $t->boolean('dry_run')->default(false);
                $t->integer('total')->default(0);
                $t->integer('created_count')->default(0);
                $t->integer('updated_count')->default(0);
                $t->integer('skipped_count')->default(0);
                $t->integer('failed_count')->default(0);
                $t->text('error')->nullable();
                $t->timestamp('started_at')->nullable();
                $t->timestamp('finished_at')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps();
            });
            $this->grant('integration_sync_runs');
        }

        if (!Schema::hasTable('integration_sync_records')) {
            Schema::create('integration_sync_records', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('run_id')->index();
                $t->string('entity', 32);
                $t->string('external_id', 200)->nullable();
                $t->string('title', 300)->nullable();
                $t->string('action', 16);          // created|updated|skipped|failed
                $t->string('target_id', 64)->nullable();
                $t->json('payload')->nullable();
                $t->text('error')->nullable();
                $t->integer('retry_count')->default(0);
                $t->timestamps();
            });
            $this->grant('integration_sync_records');
        }

        if (!Schema::hasTable('payroll_entries')) {
            Schema::create('payroll_entries', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->string('user_id', 64)->nullable()->index();
                $t->string('external_id', 200)->nullable()->index();
                $t->string('period', 7);                // YYYY-MM
                $t->string('kind', 16)->default('accrual'); // accrual|deduction
                $t->string('code', 64)->nullable();
                $t->string('name', 300)->nullable();
                $t->decimal('amount', 14, 2)->default(0);
                $t->string('currency', 8)->default('RUB');
                $t->uuid('source_run_id')->nullable()->index();
                $t->timestamps();
                $t->index(['company_id', 'period']);
            });
            $this->grant('payroll_entries');
        }

        foreach (['profiles', 'departments', 'positions'] as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, 'external_id')) {
                try {
                    Schema::table($table, function (Blueprint $t) {
                        $t->string('external_id', 200)->nullable()->index();
                    });
                } catch (\Throwable) {
                    // колонка/индекс уже есть — пропускаем
                }
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_entries');
        Schema::dropIfExists('integration_sync_records');
        Schema::dropIfExists('integration_sync_runs');
        Schema::dropIfExists('integration_field_mappings');
        Schema::dropIfExists('integration_connections');
    }
};
