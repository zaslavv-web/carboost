<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * RAG: chunk → embed → store, и semantic search по company_id.
 * Embedding endpoint берётся из настроек активного AI-провайдера (см. AiSettingsResolver).
 *
 * Поддерживаемые провайдеры embeddings:
 *  - openai_compatible / internal_rag / gemini  → POST {api_url_base}/embeddings  (OpenAI-style)
 *  - yandexgpt → foundationModels/v1/textEmbedding
 *  - gigachat  → /embeddings
 *  - disabled  → исключение
 */
class RagService
{
    public function __construct(protected AiSettingsResolver $resolver) {}

    /** Возвращает true, если БД с pgvector (есть колонка vector). */
    public function hasPgvector(): bool
    {
        static $cache = null;
        if ($cache !== null) return $cache;
        try {
            $row = DB::selectOne("SELECT data_type FROM information_schema.columns WHERE table_name='rag_documents' AND column_name='embedding'");
            $cache = $row && stripos((string) $row->data_type, 'vector') !== false || ($row && $row->data_type === 'USER-DEFINED');
        } catch (\Throwable) { $cache = false; }
        return (bool) $cache;
    }

    /**
     * Индексировать текст: разбить на чанки, посчитать embeddings, сохранить.
     * @return array{indexed:int,skipped:int}
     */
    public function index(string $companyId, string $text, array $meta = []): array
    {
        $text = trim($text);
        if ($text === '') return ['indexed' => 0, 'skipped' => 0];

        $chunks = $this->chunk($text, 900, 120);
        $vectors = $this->embedBatch($chunks);

        $sourceId = (string) ($meta['source_id'] ?? Str::uuid());
        $title    = (string) ($meta['title'] ?? '');
        $type     = (string) ($meta['source_type'] ?? 'manual');

        // удалить старые чанки по тому же source_id
        DB::table('rag_documents')->where('company_id', $companyId)->where('source_id', $sourceId)->delete();

        $indexed = 0;
        foreach ($chunks as $i => $chunk) {
            $vec = $vectors[$i] ?? null;
            if (! $vec) continue;
            $row = [
                'company_id'      => $companyId,
                'source_type'     => $type,
                'source_id'       => $sourceId,
                'title'           => $title ?: null,
                'chunk_index'     => $i,
                'chunk_text'      => $chunk,
                'metadata'        => json_encode($meta, JSON_UNESCAPED_UNICODE),
                'embedding_model' => $vectors['__model'] ?? null,
                'embedding_dims'  => count($vec),
                'created_at'      => now(),
                'updated_at'      => now(),
            ];

            if ($this->hasPgvector()) {
                $literal = '[' . implode(',', array_map(fn ($v) => (float) $v, $vec)) . ']';
                $row['embedding'] = DB::raw("'" . $literal . "'::vector");
                DB::table('rag_documents')->insert($row);
            } else {
                $row['embedding'] = json_encode($vec);
                DB::table('rag_documents')->insert($row);
            }
            $indexed++;
        }

        return ['indexed' => $indexed, 'skipped' => count($chunks) - $indexed, 'source_id' => $sourceId];
    }

    /**
     * Семантический поиск.
     * @return array<int,array{id:int,score:float,chunk_text:string,title:?string,source_id:string,metadata:mixed}>
     */
    public function search(string $companyId, string $query, int $k = 5): array
    {
        $vec = $this->embedBatch([$query])[0] ?? null;
        if (! $vec) return [];

        if ($this->hasPgvector()) {
            $literal = '[' . implode(',', array_map(fn ($v) => (float) $v, $vec)) . ']';
            $rows = DB::select(
                "SELECT id, source_id, title, chunk_text, metadata,
                        1 - (embedding <=> ?::vector) AS score
                   FROM rag_documents
                  WHERE company_id = ?
                  ORDER BY embedding <=> ?::vector
                  LIMIT ?",
                [$literal, $companyId, $literal, $k]
            );
            return array_map(fn ($r) => [
                'id' => (int) $r->id, 'score' => (float) $r->score,
                'chunk_text' => $r->chunk_text, 'title' => $r->title,
                'source_id' => $r->source_id, 'metadata' => json_decode((string) $r->metadata, true),
            ], $rows);
        }

        // Fallback: cosine in PHP по всем чанкам компании (для on-prem без pgvector — до ~50k чанков ок)
        $rows = DB::table('rag_documents')->where('company_id', $companyId)
            ->select('id','source_id','title','chunk_text','metadata','embedding')->get();
        $scored = [];
        foreach ($rows as $r) {
            $emb = json_decode((string) $r->embedding, true);
            if (! is_array($emb)) continue;
            $scored[] = [
                'id' => (int) $r->id, 'score' => $this->cosine($vec, $emb),
                'chunk_text' => $r->chunk_text, 'title' => $r->title,
                'source_id' => $r->source_id,
                'metadata' => json_decode((string) $r->metadata, true),
            ];
        }
        usort($scored, fn ($a, $b) => $b['score'] <=> $a['score']);
        return array_slice($scored, 0, $k);
    }

    /** Build a context block for the LLM (top-K passages). */
    public function buildContext(string $companyId, string $query, int $k = 5): string
    {
        $hits = $this->search($companyId, $query, $k);
        if (! $hits) return '';
        $parts = [];
        foreach ($hits as $i => $h) {
            $title = $h['title'] ? " — {$h['title']}" : '';
            $parts[] = "[" . ($i + 1) . $title . "]\n" . trim($h['chunk_text']);
        }
        return "Используй только сведения из источников ниже. Если ответа нет — скажи об этом.\n\n" . implode("\n\n", $parts);
    }

    /** ----------------- internals ----------------- */

    /** @return array<int,string> */
    public function chunk(string $text, int $size = 900, int $overlap = 120): array
    {
        $text = preg_replace('/\s+/u', ' ', $text) ?: $text;
        $len = mb_strlen($text);
        if ($len <= $size) return [$text];
        $chunks = []; $i = 0;
        while ($i < $len) {
            $chunks[] = mb_substr($text, $i, $size);
            $i += max(1, $size - $overlap);
        }
        return $chunks;
    }

    /**
     * @param  array<int,string> $inputs
     * @return array<int,array<int,float>>&array{__model?:string}
     */
    protected function embedBatch(array $inputs): array
    {
        if (! $inputs) return [];
        ['settings' => $row, 'driver' => $driver] = $this->resolver->resolve();
        $provider = $driver->name();

        if ($provider === 'disabled') {
            throw new RuntimeException('RAG недоступен: AI-провайдер отключён администратором');
        }

        return match ($provider) {
            'yandexgpt' => $this->embedYandex($row, $inputs),
            'gigachat'  => $this->embedGigaChat($row, $inputs),
            default     => $this->embedOpenAI($row, $inputs),
        };
    }

    protected function embedOpenAI(?object $row, array $inputs): array
    {
        $base = $this->openAiBase($row);
        $model = data_get($this->resolver->extra($row), 'embedding_model', env('AI_EMBEDDING_MODEL', 'text-embedding-3-small'));
        $key = $row?->api_key_enc ? $this->resolver->buildDriverKey($row) : (string) env('AI_API_KEY', '');
        if (! $key) $key = (string) env('LOVABLE_API_KEY', '');

        $resp = Http::timeout(60)->withHeaders([
            'Authorization' => "Bearer $key",
            'Content-Type' => 'application/json',
        ])->post(rtrim($base, '/') . '/embeddings', [
            'model' => $model,
            'input' => $inputs,
        ]);

        if (! $resp->ok()) {
            Log::warning('embedOpenAI failed', ['status' => $resp->status(), 'body' => $resp->body()]);
            throw new RuntimeException('Embeddings provider error: ' . $resp->status());
        }
        $data = $resp->json('data') ?? [];
        $out = array_map(fn ($d) => $d['embedding'] ?? [], $data);
        $out['__model'] = $model;
        return $out;
    }

    protected function embedYandex(?object $row, array $inputs): array
    {
        $key = $this->resolver->buildDriverKey($row);
        $folder = data_get($this->resolver->extra($row), 'folder_id', env('YANDEX_FOLDER_ID'));
        $model = data_get($this->resolver->extra($row), 'embedding_model', 'text-search-doc/latest');
        $modelUri = "emb://{$folder}/{$model}";
        $out = [];
        foreach ($inputs as $text) {
            $resp = Http::timeout(60)->withHeaders([
                'Authorization' => "Api-Key $key",
                'Content-Type' => 'application/json',
            ])->post('https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding', [
                'modelUri' => $modelUri,
                'text' => $text,
            ]);
            if (! $resp->ok()) throw new RuntimeException('YandexGPT embeddings error: ' . $resp->status());
            $out[] = $resp->json('embedding') ?? [];
        }
        $out['__model'] = $modelUri;
        return $out;
    }

    protected function embedGigaChat(?object $row, array $inputs): array
    {
        $base = (string) ($row?->api_url ?: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions');
        $base = preg_replace('#/chat/completions.*$#', '', $base) ?: $base;
        $key = $this->resolver->buildDriverKey($row);
        $resp = Http::timeout(60)->withHeaders([
            'Authorization' => "Bearer $key",
            'Content-Type' => 'application/json',
        ])->post(rtrim($base, '/') . '/embeddings', [
            'model' => 'Embeddings',
            'input' => $inputs,
        ]);
        if (! $resp->ok()) throw new RuntimeException('GigaChat embeddings error: ' . $resp->status());
        $out = array_map(fn ($d) => $d['embedding'] ?? [], $resp->json('data') ?? []);
        $out['__model'] = 'Embeddings';
        return $out;
    }

    protected function openAiBase(?object $row): string
    {
        $url = (string) ($row?->api_url ?? env('AI_API_URL', 'https://api.openai.com/v1'));
        // отрежем хвост /chat/completions если он есть
        return preg_replace('#/chat/completions.*$#', '', $url) ?: $url;
    }

    protected function cosine(array $a, array $b): float
    {
        $n = min(count($a), count($b));
        $dot = 0.0; $na = 0.0; $nb = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $dot += $a[$i] * $b[$i];
            $na += $a[$i] * $a[$i];
            $nb += $b[$i] * $b[$i];
        }
        if ($na == 0 || $nb == 0) return 0.0;
        return $dot / (sqrt($na) * sqrt($nb));
    }
}
