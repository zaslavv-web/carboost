<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Волна 5: Core HR — расширение HR-документов персональными делами сотрудников
 * (договоры, доп.соглашения, приказы, справки, медкнижки).
 *
 * hr_documents:
 *   + owner_user_id  — владелец документа (сотрудник, к которому он относится)
 *   + valid_from     — с какой даты действует
 *   + valid_until    — до какой даты действует (для отслеживания истечения)
 *   + is_confidential— доступ только HR/владельцу
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('hr_documents')) return;

        Schema::table('hr_documents', function (Blueprint $t) {
            if (!Schema::hasColumn('hr_documents', 'owner_user_id')) {
                $t->uuid('owner_user_id')->nullable()->after('created_by');
                $t->index(['company_id', 'owner_user_id']);
            }
            if (!Schema::hasColumn('hr_documents', 'valid_from')) {
                $t->date('valid_from')->nullable();
            }
            if (!Schema::hasColumn('hr_documents', 'valid_until')) {
                $t->date('valid_until')->nullable();
                $t->index(['company_id', 'valid_until']);
            }
            if (!Schema::hasColumn('hr_documents', 'is_confidential')) {
                $t->boolean('is_confidential')->default(false);
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('hr_documents')) return;
        Schema::table('hr_documents', function (Blueprint $t) {
            foreach (['owner_user_id', 'valid_from', 'valid_until', 'is_confidential'] as $col) {
                if (Schema::hasColumn('hr_documents', $col)) {
                    $t->dropColumn($col);
                }
            }
        });
    }
};
