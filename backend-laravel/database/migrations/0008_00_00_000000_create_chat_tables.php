<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Внутренние чаты компании.
 *
 *  - chat_conversations: диалог/группа/канал (типы: direct|group|department)
 *  - chat_participants:  кто состоит в диалоге + last_read_at для непрочитанных
 *  - chat_messages:      сообщения (text body + опц. reply_to)
 *  - chat_message_reactions: эмодзи-реакции
 *  - chat_permissions:   заготовка под будущие тонкие права
 *    (расписание, белые/чёрные списки) — пока пустая.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('chat_conversations')) {
            Schema::create('chat_conversations', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('type', 32)->default('direct'); // direct|group|department
                $t->string('title', 255)->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamp('last_message_at')->nullable();
                $t->timestamps();
                $t->index(['company_id', 'last_message_at']);
                $t->index(['company_id', 'type']);
            });
        }

        if (!Schema::hasTable('chat_participants')) {
            Schema::create('chat_participants', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('conversation_id');
                $t->uuid('user_id');
                $t->string('role', 16)->default('member'); // member|admin
                $t->timestamp('joined_at')->useCurrent();
                $t->timestamp('last_read_at')->nullable();
                $t->timestamp('muted_until')->nullable();
                $t->timestamps();
                $t->unique(['conversation_id', 'user_id']);
                $t->index(['user_id']);
            });
        }

        if (!Schema::hasTable('chat_messages')) {
            Schema::create('chat_messages', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('conversation_id');
                $t->uuid('sender_id');
                $t->text('body');
                $t->uuid('reply_to_id')->nullable();
                $t->timestamp('edited_at')->nullable();
                $t->timestamp('deleted_at')->nullable();
                $t->timestamps();
                $t->index(['conversation_id', 'created_at']);
                $t->index(['sender_id']);
            });
        }

        if (!Schema::hasTable('chat_message_reactions')) {
            Schema::create('chat_message_reactions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('message_id');
                $t->uuid('user_id');
                $t->string('emoji', 32);
                $t->timestamp('created_at')->useCurrent();
                $t->unique(['message_id', 'user_id', 'emoji']);
                $t->index(['message_id']);
            });
        }

        if (!Schema::hasTable('chat_permissions')) {
            Schema::create('chat_permissions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->string('scope', 32); // company|department|role|user
                $t->boolean('allow_send')->default(true);
                $t->time('time_window_start')->nullable();
                $t->time('time_window_end')->nullable();
                $t->json('weekdays')->nullable();   // [1..7]
                $t->json('whitelist')->nullable();  // ids списком
                $t->json('blacklist')->nullable();
                $t->timestamps();
                $t->index(['company_id', 'scope']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_permissions');
        Schema::dropIfExists('chat_message_reactions');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_participants');
        Schema::dropIfExists('chat_conversations');
    }
};
