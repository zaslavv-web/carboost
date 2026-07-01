<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Portal & Communications — Волна 4:
 *  - portal_posts / portal_post_reactions / portal_post_comments — корпоративная лента
 *  - portal_communities / portal_community_members — сообщества по интересам
 *  - pulse_surveys / pulse_survey_questions / pulse_survey_responses — pulse-опросы
 * Мультитенантность через company_id (BelongsToCompany).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('portal_posts', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('author_id');
            $t->uuid('community_id')->nullable()->index();
            $t->string('kind', 24)->default('post'); // post|announcement|event|poll
            $t->string('title')->nullable();
            $t->longText('body_md')->nullable();
            $t->jsonb('attachments')->nullable();
            $t->boolean('is_pinned')->default(false);
            $t->timestamp('published_at')->nullable();
            $t->unsignedInteger('views_count')->default(0);
            $t->unsignedInteger('reactions_count')->default(0);
            $t->unsignedInteger('comments_count')->default(0);
            $t->timestamps();
            $t->index(['company_id', 'published_at']);
        });

        Schema::create('portal_post_reactions', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('post_id')->index();
            $t->uuid('user_id')->index();
            $t->string('emoji', 16)->default('👍');
            $t->timestamps();
            $t->unique(['post_id', 'user_id', 'emoji']);
        });

        Schema::create('portal_post_comments', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('post_id')->index();
            $t->uuid('author_id');
            $t->uuid('parent_id')->nullable();
            $t->text('body');
            $t->timestamps();
        });

        Schema::create('portal_communities', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->string('title');
            $t->string('slug')->nullable();
            $t->text('description')->nullable();
            $t->string('cover_url')->nullable();
            $t->string('privacy', 16)->default('open'); // open|closed|secret
            $t->uuid('owner_id')->nullable();
            $t->unsignedInteger('members_count')->default(0);
            $t->timestamps();
            $t->unique(['company_id', 'slug']);
        });

        Schema::create('portal_community_members', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('community_id')->index();
            $t->uuid('user_id')->index();
            $t->string('role', 16)->default('member'); // owner|moderator|member
            $t->timestamps();
            $t->unique(['community_id', 'user_id']);
        });

        Schema::create('pulse_surveys', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('created_by')->nullable();
            $t->string('title');
            $t->text('description')->nullable();
            $t->string('audience', 24)->default('company'); // company|department|community|custom
            $t->uuid('audience_ref')->nullable();
            $t->boolean('is_anonymous')->default(true);
            $t->string('status', 16)->default('draft'); // draft|running|closed
            $t->timestamp('starts_at')->nullable();
            $t->timestamp('ends_at')->nullable();
            $t->timestamps();
            $t->index(['company_id', 'status']);
        });

        Schema::create('pulse_survey_questions', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('survey_id')->index();
            $t->unsignedInteger('order_index')->default(0);
            $t->string('kind', 24)->default('scale'); // scale|nps|single|multi|text
            $t->string('title');
            $t->jsonb('options')->nullable();
            $t->boolean('is_required')->default(true);
            $t->timestamps();
        });

        Schema::create('pulse_survey_responses', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('company_id')->index();
            $t->uuid('survey_id')->index();
            $t->uuid('question_id')->index();
            $t->uuid('user_id')->nullable()->index(); // null для анонимных
            $t->integer('value_number')->nullable();
            $t->text('value_text')->nullable();
            $t->jsonb('value_json')->nullable();
            $t->timestamps();
        });

        foreach ([
            'portal_posts','portal_post_reactions','portal_post_comments',
            'portal_communities','portal_community_members',
            'pulse_surveys','pulse_survey_questions','pulse_survey_responses',
        ] as $tbl) {
            try { DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$tbl} TO PUBLIC"); } catch (\Throwable) {}
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pulse_survey_responses');
        Schema::dropIfExists('pulse_survey_questions');
        Schema::dropIfExists('pulse_surveys');
        Schema::dropIfExists('portal_community_members');
        Schema::dropIfExists('portal_communities');
        Schema::dropIfExists('portal_post_comments');
        Schema::dropIfExists('portal_post_reactions');
        Schema::dropIfExists('portal_posts');
    }
};
