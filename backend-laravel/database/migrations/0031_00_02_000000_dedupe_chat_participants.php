<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Чистит дубли в chat_participants и гарантирует уникальность пары
 * (conversation_id, user_id).
 *
 * Зачем: GET /api/chats падал по memory_limit (250MB) на выборке участников.
 * Уникальный индекс есть в исходной миграции создания таблицы, но таблица
 * могла быть создана легаси-импортом или повторными сидерами без него —
 * тогда одна и та же пара повторяется тысячи раз и коллекция раздувается.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chat_participants')) {
            return;
        }

        // Оставляем самую раннюю строку по каждой паре.
        $duplicates = DB::table('chat_participants as p')
            ->join(DB::raw('(
                SELECT conversation_id, user_id, MIN(id) AS keep_id
                FROM chat_participants
                GROUP BY conversation_id, user_id
                HAVING COUNT(*) > 1
            ) as d'), function ($join) {
                $join->on('p.conversation_id', '=', 'd.conversation_id')
                    ->on('p.user_id', '=', 'd.user_id');
            })
            ->whereColumn('p.id', '!=', 'd.keep_id')
            ->pluck('p.id');

        foreach ($duplicates->chunk(500) as $chunk) {
            DB::table('chat_participants')->whereIn('id', $chunk->all())->delete();
        }

        // Индекс мог отсутствовать — добавляем идемпотентно.
        try {
            Schema::table('chat_participants', function ($table) {
                $table->unique(['conversation_id', 'user_id'], 'chat_participants_conv_user_unique');
            });
        } catch (\Throwable $e) {
            // индекс уже существует — ок
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('chat_participants')) {
            return;
        }

        try {
            Schema::table('chat_participants', function ($table) {
                $table->dropUnique('chat_participants_conv_user_unique');
            });
        } catch (\Throwable $e) {
            // ok
        }
    }
};
