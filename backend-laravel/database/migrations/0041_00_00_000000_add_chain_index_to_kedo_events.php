<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Монотонный порядковый номер события в хеш-цепочке КЭДО.
 *
 * До этого порядок восстанавливался по (created_at, id). Внутри одной секунды
 * несколько событий (created + sent + otp_requested + signed_pep) получали
 * одинаковый created_at, а uuid-идентификаторы сортировались случайно —
 * проверка цепочки видела события не в том порядке, в каком они писались,
 * и ложно сообщала о разрыве.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('kedo_events')) {
            return;
        }
        if (! Schema::hasColumn('kedo_events', 'chain_index')) {
            Schema::table('kedo_events', function (Blueprint $t) {
                $t->unsignedBigInteger('chain_index')->default(0)->after('document_id');
                $t->index(['document_id', 'chain_index'], 'kedo_events_doc_chain_idx');
            });
        }

        // Обратная совместимость: расставляем порядок для уже записанных событий.
        $docs = DB::table('kedo_events')->select('document_id')->distinct()->pluck('document_id');
        foreach ($docs as $docId) {
            $i = 0;
            $rows = DB::table('kedo_events')->where('document_id', $docId)
                ->orderBy('created_at')->orderBy('id')->get(['id']);
            foreach ($rows as $row) {
                DB::table('kedo_events')->where('id', $row->id)->update(['chain_index' => $i++]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('kedo_events') && Schema::hasColumn('kedo_events', 'chain_index')) {
            Schema::table('kedo_events', function (Blueprint $t) {
                $t->dropIndex('kedo_events_doc_chain_idx');
                $t->dropColumn('chain_index');
            });
        }
    }
};
