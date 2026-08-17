<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SCORM-поддержка для Корпоративного университета.
 * Добавляет source_type/scorm-поля в courses, тип scorm в lessons
 * и таблицу scorm_runtime_data для cmi-значений.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('courses') && ! Schema::hasColumn('courses', 'source_type')) {
            Schema::table('courses', function (Blueprint $t) {
                $t->string('source_type', 16)->default('native')->after('mandatory'); // native|scorm
                $t->string('scorm_version', 16)->nullable()->after('source_type'); // 1.2|2004
                $t->string('scorm_package_path', 512)->nullable()->after('scorm_version');
                $t->json('scorm_manifest')->nullable()->after('scorm_package_path');
            });
        }

        if (Schema::hasTable('lessons')) {
            if (! Schema::hasColumn('lessons', 'launch_url')) {
                Schema::table('lessons', function (Blueprint $t) {
                    $t->string('launch_url', 512)->nullable()->after('attachment_url');
                });
            }
            // Расширяем enum-ограничение, если оно есть; Laravel не даёт изменить enum напрямую.
            $driver = DB::getDriverName();
            if ($driver === 'pgsql') {
                DB::statement("ALTER TABLE lessons ALTER COLUMN type TYPE varchar(16) USING type::varchar(16)");
            } elseif ($driver === 'mysql' || $driver === 'mariadb') {
                DB::statement("ALTER TABLE lessons MODIFY COLUMN type VARCHAR(16)");
            }
        }

        if (! Schema::hasTable('scorm_runtime_data')) {
            Schema::create('scorm_runtime_data', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->uuid('enrollment_id')->index();
                $t->uuid('lesson_id');
                $t->string('cmi_key', 255);
                $t->text('cmi_value')->nullable();
                $t->timestamps();
                $t->unique(['enrollment_id', 'lesson_id', 'cmi_key']);
            });
        }

        // GRANT-ы для laravel-роли (PostgreSQL-only, игнорируем ошибки на MySQL).
        foreach (['scorm_runtime_data'] as $tbl) {
            try { DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$tbl} TO PUBLIC"); } catch (\Throwable) {}
        }
        try { DB::statement('GRANT USAGE, SELECT ON SEQUENCE scorm_runtime_data_id_seq TO PUBLIC'); } catch (\Throwable) {}
    }

    public function down(): void
    {
        Schema::dropIfExists('scorm_runtime_data');

        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'source_type')) {
            Schema::table('courses', function (Blueprint $t) {
                $t->dropColumn(['source_type', 'scorm_version', 'scorm_package_path', 'scorm_manifest']);
            });
        }

        if (Schema::hasTable('lessons') && Schema::hasColumn('lessons', 'launch_url')) {
            Schema::table('lessons', function (Blueprint $t) {
                $t->dropColumn('launch_url');
            });
        }
    }
};
