<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('employee_invitations')) {
            return;
        }

        if (DB::getDriverName() === 'mysql') {
            $indexes = collect(DB::select('SHOW INDEX FROM employee_invitations'));
            $companyUnique = $indexes
                ->where('Key_name', 'employee_invitations_company_id_unique')
                ->where('Non_unique', 0)
                ->isNotEmpty();

            if ($companyUnique) {
                Schema::table('employee_invitations', function (Blueprint $table) {
                    $table->dropUnique('employee_invitations_company_id_unique');
                });
            }
        } else {
            try {
                Schema::table('employee_invitations', function (Blueprint $table) {
                    $table->dropUnique(['company_id']);
                });
            } catch (Throwable) {
                // Index name differs between database engines; ignore when absent.
            }
        }

        Schema::table('employee_invitations', function (Blueprint $table) {
            $table->index('company_id', 'employee_invitations_company_id_index');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('employee_invitations')) {
            return;
        }

        Schema::table('employee_invitations', function (Blueprint $table) {
            $table->dropIndex('employee_invitations_company_id_index');
            $table->unique('company_id');
        });
    }
};