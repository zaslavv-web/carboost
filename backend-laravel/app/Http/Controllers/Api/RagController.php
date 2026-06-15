<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AI\RagService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class RagController extends Controller
{
    public function __construct(protected RagService $rag) {}

    protected function companyId(Request $r): ?string
    {
        $u = Auth::user();
        return (string) ($r->input('company_id') ?: $u?->company_id ?: '') ?: null;
    }

    public function index(Request $r)
    {
        $cid = $this->companyId($r);
        if (! $cid) return response()->json(['error' => 'company_id required'], 422);

        $rows = DB::table('rag_documents')
            ->select('source_id','title','source_type','embedding_model','embedding_dims',
                DB::raw('count(*) as chunks'),
                DB::raw('max(updated_at) as updated_at'))
            ->where('company_id', $cid)
            ->groupBy('source_id','title','source_type','embedding_model','embedding_dims')
            ->orderByDesc(DB::raw('max(updated_at)'))
            ->get();

        return response()->json([
            'pgvector' => $this->rag->hasPgvector(),
            'documents' => $rows,
        ]);
    }

    public function store(Request $r)
    {
        $data = $r->validate([
            'text' => 'required_without:file|string',
            'file' => 'sometimes|file|max:20480',
            'title' => 'nullable|string|max:255',
            'source_type' => 'nullable|string|max:32',
        ]);
        $cid = $this->companyId($r);
        if (! $cid) return response()->json(['error' => 'company_id required'], 422);

        $text = (string) ($data['text'] ?? '');
        if ($r->hasFile('file')) {
            $text .= "\n" . file_get_contents($r->file('file')->getRealPath());
        }
        if (trim($text) === '') return response()->json(['error' => 'empty text'], 422);

        $res = $this->rag->index($cid, $text, [
            'title' => $data['title'] ?? null,
            'source_type' => $data['source_type'] ?? 'manual',
            'uploaded_by' => Auth::id(),
        ]);

        return response()->json($res);
    }

    public function search(Request $r)
    {
        $data = $r->validate([
            'query' => 'required|string|min:2',
            'k' => 'nullable|integer|min:1|max:20',
        ]);
        $cid = $this->companyId($r);
        if (! $cid) return response()->json(['error' => 'company_id required'], 422);

        return response()->json([
            'hits' => $this->rag->search($cid, $data['query'], (int) ($data['k'] ?? 5)),
        ]);
    }

    public function destroy(Request $r, string $sourceId)
    {
        $cid = $this->companyId($r);
        if (! $cid) return response()->json(['error' => 'company_id required'], 422);
        $n = DB::table('rag_documents')->where('company_id', $cid)->where('source_id', $sourceId)->delete();
        return response()->json(['deleted' => $n]);
    }
}
