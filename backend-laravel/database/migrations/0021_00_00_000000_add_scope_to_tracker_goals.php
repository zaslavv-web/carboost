<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('tracker_goals')) {
            return;
        }
        Schema::table('tracker_goals', function (Blueprint $t) {
            if (!Schema::hasColumn('tracker_goals', 'scope_type')) {
                // employee | division | department | company
                $t->string('scope_type', 24)->default('employee');
            }
            if (!Schema::hasColumn('tracker_goals', 'scope_ref')) {
                $t->uuid('scope_ref')->nullable();
            }
            if (!Schema::hasColumn('tracker_goals', 'scope_label')) {
                $t->string('scope_label', 240)->nullable();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('tracker_goals')) {
            return;
        }
        Schema::table('tracker_goals', function (Blueprint $t) {
            foreach (['scope_type', 'scope_ref', 'scope_label'] as $c) {
                if (Schema::hasColumn('tracker_goals', $c)) {
                    $t->dropColumn($c);
                }
            }
        });
    }
};
