<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * L&D — Волна 2:
 *  - individual_development_plans / idp_items — ИПР (IDP) сотрудника
 *  - knowledge_categories / knowledge_articles — База знаний (wiki)
 *  - courses.valid_months, certificates.expires_at — срок действия сертификата
 *  Мультитенантность через company_id (совместимо с BelongsToCompany).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('individual_development_plans', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('user_id')->index();
            $t->uuid('created_by')->nullable();
            $t->string('title');
            $t->text('summary')->nullable();
            $t->string('period', 32)->nullable();          // "H1 2026" / "2026 Q1"
            $t->date('starts_at')->nullable();
            $t->date('ends_at')->nullable();
            $t->string('status', 16)->default('draft');    // draft|active|completed|archived
            $t->timestamps();
            $t->index(['company_id', 'status']);
        });

        Schema::create('idp_items', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('idp_id');
            $t->unsignedInteger('order_index')->default(0);
            $t->string('kind', 24)->default('course');     // course|book|mentorship|project|certification|custom
            $t->string('title');
            $t->text('description')->nullable();
            $t->uuid('course_id')->nullable();             // связь c LMS
            $t->uuid('competency_id')->nullable();
            $t->date('due_date')->nullable();
            $t->string('status', 16)->default('planned');  // planned|in_progress|done|skipped
            $t->text('result_note')->nullable();
            $t->timestamps();
            $t->index('idp_id');
        });

        Schema::create('knowledge_categories', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('parent_id')->nullable();
            $t->string('title');
            $t->string('slug')->nullable();
            $t->unsignedInteger('order_index')->default(0);
            $t->timestamps();
            $t->unique(['company_id', 'slug']);
        });

        Schema::create('knowledge_articles', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('category_id')->nullable();
            $t->uuid('author_id')->nullable();
            $t->string('title');
            $t->string('slug')->nullable();
            $t->text('excerpt')->nullable();
            $t->longText('content_md')->nullable();
            $t->jsonb('tags')->nullable();
            $t->string('status', 16)->default('draft');    // draft|published|archived
            $t->unsignedInteger('views_count')->default(0);
            $t->timestamp('published_at')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'status']);
            $t->unique(['company_id', 'slug']);
        });

        // Срок действия сертификата (для комплаенса/переаттестации)
        if (Schema::hasTable('courses') && ! Schema::hasColumn('courses', 'valid_months')) {
            Schema::table('courses', fn (Blueprint $t) => $t->unsignedSmallInteger('valid_months')->nullable());
        }
        if (Schema::hasTable('certificates') && ! Schema::hasColumn('certificates', 'expires_at')) {
            Schema::table('certificates', fn (Blueprint $t) => $t->timestamp('expires_at')->nullable()->index());
        }

        foreach ([
            'individual_development_plans','idp_items',
            'knowledge_categories','knowledge_articles',
        ] as $tbl) {
            try { DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$tbl} TO PUBLIC"); } catch (\Throwable) {}
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('knowledge_articles');
        Schema::dropIfExists('knowledge_categories');
        Schema::dropIfExists('idp_items');
        Schema::dropIfExists('individual_development_plans');
        if (Schema::hasColumn('certificates', 'expires_at')) {
            Schema::table('certificates', fn (Blueprint $t) => $t->dropColumn('expires_at'));
        }
        if (Schema::hasColumn('courses', 'valid_months')) {
            Schema::table('courses', fn (Blueprint $t) => $t->dropColumn('valid_months'));
        }
    }
};
