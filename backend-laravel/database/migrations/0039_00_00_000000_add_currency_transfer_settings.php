<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Передача внутренней валюты между сотрудниками:
 *  - transfers_enabled      — компания может выключить переводы;
 *  - transfer_limit_per_day — дневной лимит исходящих переводов на пользователя.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('company_currency_settings')) return;

        Schema::table('company_currency_settings', function (Blueprint $t) {
            if (!Schema::hasColumn('company_currency_settings', 'transfers_enabled')) {
                $t->boolean('transfers_enabled')->default(true);
            }
            if (!Schema::hasColumn('company_currency_settings', 'transfer_limit_per_day')) {
                $t->integer('transfer_limit_per_day')->default(1000);
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('company_currency_settings')) return;
        Schema::table('company_currency_settings', function (Blueprint $t) {
            if (Schema::hasColumn('company_currency_settings', 'transfers_enabled')) $t->dropColumn('transfers_enabled');
            if (Schema::hasColumn('company_currency_settings', 'transfer_limit_per_day')) $t->dropColumn('transfer_limit_per_day');
        });
    }
};
