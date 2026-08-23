<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('portal_communities') && ! Schema::hasColumn('portal_communities', 'avatar_url')) {
            Schema::table('portal_communities', function (Blueprint $table) {
                $table->text('avatar_url')->nullable()->after('cover_url');
            });
        }
        if (Schema::hasTable('closed_question_tests') && ! Schema::hasColumn('closed_question_tests', 'audience_rules')) {
            Schema::table('closed_question_tests', function (Blueprint $table) {
                $table->json('audience_rules')->nullable()->after('position_id');
                $table->timestamp('assigned_at')->nullable()->after('is_active');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('closed_question_tests')) {
            Schema::table('closed_question_tests', function (Blueprint $table) {
                $table->dropColumn(['audience_rules', 'assigned_at']);
            });
        }
        if (Schema::hasTable('portal_communities')) {
            Schema::table('portal_communities', function (Blueprint $table) {
                $table->dropColumn('avatar_url');
            });
        }
    }
};