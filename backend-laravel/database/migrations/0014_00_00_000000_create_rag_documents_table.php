<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * RAG storage. Использует pgvector если расширение доступно,
 * иначе хранит embedding как jsonb (медленнее, но работает везде).
 */
return new class extends Migration
{
    public function up(): void
    {
        $hasPgvector = false;
        try {
            DB::statement('CREATE EXTENSION IF NOT EXISTS vector');
            $hasPgvector = true;
        } catch (\Throwable $e) {
            // нет прав/не Postgres — fallback на jsonb
        }

        Schema::create('rag_documents', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('company_id')->nullable()->index();
            $table->string('source_type', 32)->default('manual'); // manual|file|url|policy|track|...
            $table->string('source_id', 128)->nullable();
            $table->string('title')->nullable();
            $table->unsignedInteger('chunk_index')->default(0);
            $table->text('chunk_text');
            $table->jsonb('metadata')->nullable();
            $table->string('embedding_model', 128)->nullable();
            $table->unsignedInteger('embedding_dims')->nullable();
            $table->timestamps();
            $table->index(['company_id', 'source_type', 'source_id']);
        });

        if ($hasPgvector) {
            // 1536 покрывает text-embedding-3-small / bge-m3 (1024) / yandexgpt (256) — храним как gist на cosine
            DB::statement('ALTER TABLE rag_documents ADD COLUMN embedding vector(1536)');
            try {
                DB::statement('CREATE INDEX rag_documents_embedding_idx ON rag_documents USING hnsw (embedding vector_cosine_ops)');
            } catch (\Throwable) {
                // HNSW требует pgvector >= 0.5; fallback на ivfflat игнорируем — full scan ок для MVP
            }
        } else {
            Schema::table('rag_documents', function (Blueprint $t) {
                $t->jsonb('embedding')->nullable();
            });
        }

        // Грантов уже хватает (Laravel создаёт от owner-роли), но на всякий
        try { DB::statement('GRANT SELECT, INSERT, UPDATE, DELETE ON rag_documents TO PUBLIC'); } catch (\Throwable) {}
        try { DB::statement('GRANT USAGE, SELECT ON SEQUENCE rag_documents_id_seq TO PUBLIC'); } catch (\Throwable) {}
    }

    public function down(): void
    {
        Schema::dropIfExists('rag_documents');
    }
};
