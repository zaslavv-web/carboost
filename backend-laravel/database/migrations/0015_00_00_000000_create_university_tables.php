<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Корпоративный университет (LMS) — MVP.
 *  - courses, course_modules, lessons
 *  - enrollments, lesson_progress
 *  - certificates (запись + публичная страница; PDF позже)
 *
 * Видео хранится как внешняя ссылка (YouTube/Vimeo/Kinescope), у себя только URL.
 * RLS на уровне приложения через company_id (как в RAG / прочих модулях).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('courses', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->string('title');
            $t->string('slug')->nullable();
            $t->text('description')->nullable();
            $t->string('cover_url')->nullable();
            $t->string('level', 16)->default('beginner'); // beginner|intermediate|advanced
            $t->unsignedInteger('duration_min')->default(0);
            $t->jsonb('tags')->nullable();
            $t->jsonb('competencies')->nullable(); // [{skill_name, target_value}]
            $t->string('status', 16)->default('draft'); // draft|published|archived
            $t->boolean('mandatory')->default(false);
            $t->uuid('author_id')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'slug']);
            $t->index(['company_id', 'status']);
        });

        Schema::create('course_modules', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('course_id');
            $t->unsignedInteger('order_index')->default(0);
            $t->string('title');
            $t->timestamps();
            $t->index('course_id');
        });

        Schema::create('lessons', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('module_id');
            $t->unsignedInteger('order_index')->default(0);
            $t->string('type', 16)->default('markdown'); // video|markdown|pdf|test
            $t->string('title');
            $t->text('content')->nullable();           // markdown / description
            $t->string('video_url')->nullable();       // YouTube/Vimeo/Kinescope embed url
            $t->string('attachment_url')->nullable();  // PDF link
            $t->uuid('test_id')->nullable();           // closed_question_tests.id
            $t->unsignedSmallInteger('pass_score')->default(70);
            $t->unsignedInteger('duration_min')->default(0);
            $t->timestamps();
            $t->index('module_id');
        });

        Schema::create('enrollments', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('course_id');
            $t->uuid('user_id');
            $t->uuid('assigned_by')->nullable();
            $t->boolean('mandatory')->default(false);
            $t->timestamp('due_at')->nullable();
            // если true — недоступ к другим модулям пока курс не пройден
            $t->boolean('blocks_other')->default(false);
            $t->string('status', 16)->default('not_started'); // not_started|in_progress|completed|failed
            $t->timestamp('started_at')->nullable();
            $t->timestamp('completed_at')->nullable();
            $t->uuid('certificate_id')->nullable();
            $t->timestamps();
            $t->unique(['course_id', 'user_id']);
            $t->index(['user_id', 'status']);
        });

        Schema::create('lesson_progress', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->uuid('enrollment_id');
            $t->uuid('lesson_id');
            $t->boolean('completed')->default(false);
            $t->unsignedSmallInteger('score')->nullable();
            $t->unsignedSmallInteger('attempts')->default(0);
            $t->unsignedInteger('last_position')->default(0);
            $t->timestamps();
            $t->unique(['enrollment_id', 'lesson_id']);
        });

        Schema::create('certificates', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('user_id');
            $t->uuid('course_id');
            $t->string('serial', 64)->unique();
            $t->string('user_name')->nullable();
            $t->string('course_title')->nullable();
            $t->timestamp('issued_at')->useCurrent();
            $t->timestamps();
            $t->index('user_id');
        });

        // GRANT-ы для laravel-роли (как в RAG-миграции).
        foreach (['courses','course_modules','lessons','enrollments','lesson_progress','certificates'] as $tbl) {
            try { DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$tbl} TO PUBLIC"); } catch (\Throwable) {}
        }
        try { DB::statement('GRANT USAGE, SELECT ON SEQUENCE lesson_progress_id_seq TO PUBLIC'); } catch (\Throwable) {}
    }

    public function down(): void
    {
        Schema::dropIfExists('certificates');
        Schema::dropIfExists('lesson_progress');
        Schema::dropIfExists('enrollments');
        Schema::dropIfExists('lessons');
        Schema::dropIfExists('course_modules');
        Schema::dropIfExists('courses');
    }
};
