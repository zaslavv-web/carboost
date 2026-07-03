<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Модуль «Инициативы сотрудников» — источник сигнала KPI-блока комфорт-аналитики.
 * CRUD + голосование + модерация (HRD/company_admin).
 */
class InitiativeController extends Controller
{
    public function index(Request $r): JsonResponse
    {
        $u = Auth::user();
        abort_unless($u, 401);
        $companyId = (string) $u->company_id;
        if (! $companyId) return response()->json(['data' => []]);

        $status = $r->input('status');
        $q = DB::table('initiatives as i')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'i.author_id')
            ->where('i.company_id', $companyId)
            ->when($status, fn ($qq) => $qq->where('i.status', $status))
            ->orderByDesc('i.votes_count')
            ->orderByDesc('i.created_at')
            ->select('i.*', 'p.full_name as author_name', 'p.avatar_url as author_avatar');

        $rows = $q->get();
        $myVotes = DB::table('initiative_votes')
            ->where('user_id', $u->id)
            ->whereIn('initiative_id', $rows->pluck('id'))
            ->pluck('initiative_id')->all();
        $set = array_flip($myVotes);
        $rows = $rows->map(function ($x) use ($set) {
            $x->voted = isset($set[$x->id]);
            return $x;
        });
        return response()->json(['data' => $rows]);
    }

    public function store(Request $r): JsonResponse
    {
        $u = Auth::user();
        abort_unless($u && $u->company_id, 401);
        $data = $r->validate([
            'title' => 'required|string|max:240',
            'description' => 'nullable|string',
            'category' => 'nullable|string|max:64',
        ]);
        $id = (string) Str::uuid();
        DB::table('initiatives')->insert([
            'id' => $id,
            'company_id' => $u->company_id,
            'author_id' => $u->id,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'category' => $data['category'] ?? 'product',
            'status' => 'new',
            'votes_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(['id' => $id], 201);
    }

    public function vote(Request $r, string $id): JsonResponse
    {
        $u = Auth::user();
        abort_unless($u, 401);
        $init = DB::table('initiatives')->where('id', $id)->first();
        abort_unless($init && $init->company_id === $u->company_id, 404);

        $existing = DB::table('initiative_votes')
            ->where('initiative_id', $id)->where('user_id', $u->id)->first();
        if ($existing) {
            DB::table('initiative_votes')->where('id', $existing->id)->delete();
            DB::table('initiatives')->where('id', $id)->decrement('votes_count');
            return response()->json(['voted' => false]);
        }
        DB::table('initiative_votes')->insert([
            'id' => (string) Str::uuid(),
            'initiative_id' => $id,
            'user_id' => $u->id,
            'created_at' => now(),
        ]);
        DB::table('initiatives')->where('id', $id)->increment('votes_count');
        return response()->json(['voted' => true]);
    }

    public function review(Request $r, string $id): JsonResponse
    {
        $u = Auth::user();
        if (! $this->canManage($u)) return response()->json(['error' => 'forbidden'], 403);
        $data = $r->validate([
            'status' => 'required|in:new,in_review,accepted,rejected,done',
            'review_note' => 'nullable|string',
        ]);
        DB::table('initiatives')->where('id', $id)->update([
            'status' => $data['status'],
            'review_note' => $data['review_note'] ?? null,
            'reviewer_id' => $u->id,
            'reviewed_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(['ok' => true]);
    }

    public function destroy(string $id): JsonResponse
    {
        $u = Auth::user();
        $init = DB::table('initiatives')->where('id', $id)->first();
        abort_unless($init, 404);
        if ($init->author_id !== $u->id && ! $this->canManage($u)) {
            return response()->json(['error' => 'forbidden'], 403);
        }
        DB::table('initiative_votes')->where('initiative_id', $id)->delete();
        DB::table('initiatives')->where('id', $id)->delete();
        return response()->json(['ok' => true]);
    }

    private function canManage($u): bool
    {
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hrd', 'company_admin', 'superadmin']);
    }
}
