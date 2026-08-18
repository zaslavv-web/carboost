<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Epic D1 — Talent Review: 9-box / 12-box, сессии калибровки с протоколом,
 * карта преемственности и кадровый резерв.
 *
 * Все выборки — raw SQL (без Eloquent-гидрации), как в PerformanceController.
 */
class TalentReviewController extends Controller
{
    // ================= Sessions =================

    public function indexSessions(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $rows = DB::table('talent_review_sessions')
            ->where('company_id', $companyId)
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        $counts = DB::table('talent_review_ratings')
            ->where('company_id', $companyId)
            ->select('session_id', DB::raw('count(*) as c'))
            ->groupBy('session_id')
            ->pluck('c', 'session_id');

        $data = $rows->map(function ($r) use ($counts) {
            $r->rated_count = (int) ($counts[$r->id] ?? 0);
            return $r;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function storeSession(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'title'        => 'required|string|max:200',
            'grid_type'    => 'sometimes|in:9box,12box',
            'cycle_id'     => 'nullable|uuid',
            'department'   => 'nullable|string|max:200',
            'scheduled_at' => 'nullable|date',
        ]);
        $companyId = $this->companyId($request);
        if (!$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }

        $id = (string) Str::uuid();
        DB::table('talent_review_sessions')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'title' => $data['title'],
            'grid_type' => $data['grid_type'] ?? '9box',
            'status' => 'draft',
            'cycle_id' => $data['cycle_id'] ?? null,
            'department' => $data['department'] ?? null,
            'facilitator_id' => $this->userId($request),
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'created_by' => $this->userId($request),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('talent_review_sessions')->where('id', $id)->first(), 201);
    }

    public function updateSession(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $session = $this->findSession($id, $request);
        $payload = array_filter(
            $request->only(['title', 'grid_type', 'status', 'department', 'scheduled_at', 'protocol', 'cycle_id']),
            fn ($v) => $v !== null
        );
        if ($payload) {
            $payload['updated_at'] = now();
            if (($payload['status'] ?? null) === 'completed') {
                $payload['completed_at'] = now();
            }
            DB::table('talent_review_sessions')->where('id', $session->id)->update($payload);
        }
        return response()->json(DB::table('talent_review_sessions')->where('id', $session->id)->first());
    }

    public function destroySession(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $session = $this->findSession($id, $request);
        DB::table('talent_review_ratings')->where('session_id', $session->id)->delete();
        DB::table('talent_review_notes')->where('session_id', $session->id)->delete();
        DB::table('talent_review_sessions')->where('id', $session->id)->delete();
        return response()->json(['ok' => true]);
    }

    // ================= Grid =================

    /**
     * Матрица: сотрудники компании + performance (авто из performance_reviews)
     * + potential (ручная калибровка) + номер box.
     */
    public function grid(string $id, Request $request): JsonResponse
    {
        $session = $this->findSession($id, $request);
        $companyId = (string) $session->company_id;
        $cols = $session->grid_type === '12box' ? 4 : 3;

        $q = DB::table('profiles')
            ->where('company_id', $companyId)
            ->select('user_id', 'full_name', 'position', 'department', 'avatar_url', 'overall_score');
        if ($session->department) {
            $q->where('department', $session->department);
        }
        $profiles = $q->orderBy('full_name')->limit(1000)->get();
        $userIds = $profiles->pluck('user_id')->filter()->values()->all();

        $perf = collect();
        if ($userIds && Schema::hasTable('performance_reviews')) {
            $pq = DB::table('performance_reviews')
                ->whereIn('user_id', $userIds)
                ->whereNotNull('final_score')
                ->select('user_id', 'final_score', 'cycle_id', 'finalized_at');
            if ($session->cycle_id) {
                $pq->where('cycle_id', $session->cycle_id);
            }
            $perf = $pq->orderByDesc('finalized_at')->get()->keyBy('user_id');
        }

        $ratings = DB::table('talent_review_ratings')
            ->where('session_id', $session->id)
            ->get()
            ->keyBy('user_id');

        $rows = $profiles->map(function ($p) use ($perf, $ratings, $cols) {
            $rating = $ratings[$p->user_id] ?? null;
            $score = $rating->performance_score
                ?? ($perf[$p->user_id]->final_score ?? $p->overall_score);
            $score = $score !== null ? (float) $score : null;

            $perfLevel = $rating->perf_level ?? $this->scoreToLevel($score, $cols);
            $potLevel = $rating->pot_level ?? 2;

            return [
                'user_id' => $p->user_id,
                'full_name' => $p->full_name,
                'position' => $p->position,
                'department' => $p->department,
                'avatar_url' => $p->avatar_url,
                'performance_score' => $score,
                'perf_level' => (int) $perfLevel,
                'pot_level' => (int) $potLevel,
                'box' => $this->boxOf((int) $perfLevel, (int) $potLevel, $cols),
                'agreed' => (bool) ($rating->agreed ?? false),
                'flight_risk' => $rating->flight_risk ?? null,
                'note' => $rating->note ?? null,
                'calibrated' => $rating !== null,
            ];
        })->values();

        return response()->json([
            'session' => $session,
            'cols' => $cols,
            'rows' => $rows,
        ]);
    }

    /** Upsert одной или нескольких оценок. */
    public function saveRatings(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $session = $this->findSession($id, $request);
        $cols = $session->grid_type === '12box' ? 4 : 3;

        $data = $request->validate([
            'ratings' => 'required|array|min:1',
            'ratings.*.user_id' => 'required|uuid',
            'ratings.*.perf_level' => 'required|integer|min:1|max:4',
            'ratings.*.pot_level' => 'required|integer|min:1|max:3',
            'ratings.*.performance_score' => 'nullable|numeric',
            'ratings.*.flight_risk' => 'nullable|in:low,medium,high',
            'ratings.*.agreed' => 'nullable|boolean',
            'ratings.*.note' => 'nullable|string|max:2000',
        ]);

        foreach ($data['ratings'] as $r) {
            $perfLevel = min((int) $r['perf_level'], $cols);
            $potLevel = (int) $r['pot_level'];
            $payload = [
                'company_id' => $session->company_id,
                'session_id' => $session->id,
                'user_id' => $r['user_id'],
                'performance_score' => $r['performance_score'] ?? null,
                'perf_level' => $perfLevel,
                'pot_level' => $potLevel,
                'box' => $this->boxOf($perfLevel, $potLevel, $cols),
                'agreed' => (bool) ($r['agreed'] ?? false),
                'flight_risk' => $r['flight_risk'] ?? null,
                'note' => $r['note'] ?? null,
                'rated_by' => $this->userId($request),
                'updated_at' => now(),
            ];

            $existing = DB::table('talent_review_ratings')
                ->where('session_id', $session->id)
                ->where('user_id', $r['user_id'])
                ->first();

            if ($existing) {
                DB::table('talent_review_ratings')->where('id', $existing->id)->update($payload);
            } else {
                $payload['id'] = (string) Str::uuid();
                $payload['created_at'] = now();
                DB::table('talent_review_ratings')->insert($payload);
            }
        }

        if ($session->status === 'draft') {
            DB::table('talent_review_sessions')->where('id', $session->id)
                ->update(['status' => 'in_progress', 'updated_at' => now()]);
        }

        return response()->json(['ok' => true, 'saved' => count($data['ratings'])]);
    }

    // ================= Протокол =================

    public function indexNotes(string $id, Request $request): JsonResponse
    {
        $session = $this->findSession($id, $request);
        $notes = DB::table('talent_review_notes')
            ->where('session_id', $session->id)
            ->orderBy('created_at')
            ->limit(500)
            ->get();

        $subjectIds = $notes->pluck('subject_id')->filter()->unique()->values()->all();
        $names = $subjectIds
            ? DB::table('profiles')->whereIn('user_id', $subjectIds)->pluck('full_name', 'user_id')
            : collect();

        $data = $notes->map(function ($n) use ($names) {
            $n->subject_name = $n->subject_id ? ($names[$n->subject_id] ?? null) : null;
            return $n;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function storeNote(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $session = $this->findSession($id, $request);
        $data = $request->validate([
            'body' => 'required|string|max:4000',
            'kind' => 'sometimes|in:note,decision,action',
            'subject_id' => 'nullable|uuid',
            'assignee_id' => 'nullable|uuid',
            'due_date' => 'nullable|date',
        ]);

        $noteId = (string) Str::uuid();
        DB::table('talent_review_notes')->insert([
            'id' => $noteId,
            'company_id' => $session->company_id,
            'session_id' => $session->id,
            'subject_id' => $data['subject_id'] ?? null,
            'kind' => $data['kind'] ?? 'note',
            'body' => $data['body'],
            'assignee_id' => $data['assignee_id'] ?? null,
            'due_date' => $data['due_date'] ?? null,
            'author_id' => $this->userId($request),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(DB::table('talent_review_notes')->where('id', $noteId)->first(), 201);
    }

    public function destroyNote(string $id, string $noteId, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $session = $this->findSession($id, $request);
        DB::table('talent_review_notes')->where('session_id', $session->id)->where('id', $noteId)->delete();
        return response()->json(['ok' => true]);
    }

    // ================= Кадровый резерв =================

    public function indexPool(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $rows = DB::table('talent_pool_members')
            ->where('company_id', $companyId)
            ->orderByDesc('created_at')
            ->limit(500)
            ->get();

        $userIds = $rows->pluck('user_id')->filter()->unique()->values()->all();
        $profiles = $userIds
            ? DB::table('profiles')->whereIn('user_id', $userIds)
                ->select('user_id', 'full_name', 'position', 'department', 'avatar_url')->get()->keyBy('user_id')
            : collect();

        $data = $rows->map(function ($r) use ($profiles) {
            $p = $profiles[$r->user_id] ?? null;
            $r->full_name = $p->full_name ?? null;
            $r->position = $p->position ?? null;
            $r->department = $p->department ?? null;
            $r->avatar_url = $p->avatar_url ?? null;
            return $r;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function storePoolMember(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'user_id' => 'required|uuid',
            'pool' => 'sometimes|in:hipo,successor,key_talent,risk',
            'note' => 'nullable|string|max:1000',
        ]);
        $companyId = $this->companyId($request);
        $pool = $data['pool'] ?? 'hipo';

        $exists = DB::table('talent_pool_members')
            ->where('company_id', $companyId)->where('user_id', $data['user_id'])->where('pool', $pool)->first();
        if ($exists) {
            return response()->json($exists);
        }

        $id = (string) Str::uuid();
        DB::table('talent_pool_members')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'user_id' => $data['user_id'],
            'pool' => $pool,
            'source' => 'manual',
            'note' => $data['note'] ?? null,
            'added_by' => $this->userId($request),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(DB::table('talent_pool_members')->where('id', $id)->first(), 201);
    }

    public function destroyPoolMember(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        DB::table('talent_pool_members')
            ->where('company_id', $this->companyId($request))->where('id', $id)->delete();
        return response()->json(['ok' => true]);
    }

    /** Автоформирование резерва по итогам сессии (верхние боксы). */
    public function buildPool(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $session = $this->findSession($id, $request);
        $cols = $session->grid_type === '12box' ? 4 : 3;

        $ratings = DB::table('talent_review_ratings')->where('session_id', $session->id)->get();
        $added = 0;

        foreach ($ratings as $r) {
            $pool = null;
            if ((int) $r->pot_level === 3 && (int) $r->perf_level >= $cols - 1) {
                $pool = 'hipo';
            } elseif ((int) $r->perf_level === $cols && (int) $r->pot_level >= 2) {
                $pool = 'key_talent';
            } elseif (in_array($r->flight_risk, ['high'], true) && (int) $r->perf_level >= $cols - 1) {
                $pool = 'risk';
            }
            if (!$pool) continue;

            $exists = DB::table('talent_pool_members')
                ->where('company_id', $session->company_id)
                ->where('user_id', $r->user_id)
                ->where('pool', $pool)
                ->exists();
            if ($exists) continue;

            DB::table('talent_pool_members')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $session->company_id,
                'user_id' => $r->user_id,
                'pool' => $pool,
                'source' => 'auto',
                'session_id' => $session->id,
                'box' => $r->box,
                'added_by' => $this->userId($request),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $added++;
        }

        return response()->json(['ok' => true, 'added' => $added]);
    }

    // ================= Преемственность =================

    public function indexPlans(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $plans = DB::table('succession_plans')
            ->where('company_id', $companyId)
            ->orderBy('position_title')
            ->limit(300)
            ->get();

        $planIds = $plans->pluck('id')->all();
        $candidates = $planIds
            ? DB::table('succession_candidates')->whereIn('plan_id', $planIds)->orderBy('rank')->get()
            : collect();

        $userIds = $candidates->pluck('user_id')
            ->merge($plans->pluck('incumbent_id'))->filter()->unique()->values()->all();
        $profiles = $userIds
            ? DB::table('profiles')->whereIn('user_id', $userIds)
                ->select('user_id', 'full_name', 'position', 'avatar_url')->get()->keyBy('user_id')
            : collect();

        $byPlan = $candidates->groupBy('plan_id');
        $data = $plans->map(function ($p) use ($byPlan, $profiles) {
            $p->incumbent_name = $p->incumbent_id ? ($profiles[$p->incumbent_id]->full_name ?? null) : null;
            $p->candidates = collect($byPlan[$p->id] ?? [])->map(function ($c) use ($profiles) {
                $prof = $profiles[$c->user_id] ?? null;
                $c->full_name = $prof->full_name ?? null;
                $c->position = $prof->position ?? null;
                $c->avatar_url = $prof->avatar_url ?? null;
                return $c;
            })->values();
            return $p;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function storePlan(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'position_title' => 'required|string|max:200',
            'position_id' => 'nullable|uuid',
            'incumbent_id' => 'nullable|uuid',
            'criticality' => 'sometimes|in:low,medium,high',
            'risk_of_loss' => 'sometimes|in:low,medium,high',
            'note' => 'nullable|string|max:2000',
        ]);

        $id = (string) Str::uuid();
        DB::table('succession_plans')->insert([
            'id' => $id,
            'company_id' => $this->companyId($request),
            'position_id' => $data['position_id'] ?? null,
            'position_title' => $data['position_title'],
            'incumbent_id' => $data['incumbent_id'] ?? null,
            'criticality' => $data['criticality'] ?? 'medium',
            'risk_of_loss' => $data['risk_of_loss'] ?? 'low',
            'note' => $data['note'] ?? null,
            'created_by' => $this->userId($request),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(DB::table('succession_plans')->where('id', $id)->first(), 201);
    }

    public function updatePlan(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);
        $payload = array_filter(
            $request->only(['position_title', 'incumbent_id', 'criticality', 'risk_of_loss', 'note']),
            fn ($v) => $v !== null
        );
        if ($payload) {
            $payload['updated_at'] = now();
            DB::table('succession_plans')->where('company_id', $companyId)->where('id', $id)->update($payload);
        }
        return response()->json(DB::table('succession_plans')->where('id', $id)->first());
    }

    public function destroyPlan(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        DB::table('succession_candidates')->where('plan_id', $id)->delete();
        DB::table('succession_plans')->where('company_id', $this->companyId($request))->where('id', $id)->delete();
        return response()->json(['ok' => true]);
    }

    public function storeCandidate(string $planId, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'user_id' => 'required|uuid',
            'readiness' => 'sometimes|in:ready_now,1_2_years,3_plus',
            'rank' => 'nullable|integer|min:0|max:999',
            'note' => 'nullable|string|max:1000',
        ]);
        $companyId = $this->companyId($request);

        $existing = DB::table('succession_candidates')
            ->where('plan_id', $planId)->where('user_id', $data['user_id'])->first();
        $payload = [
            'readiness' => $data['readiness'] ?? '1_2_years',
            'rank' => $data['rank'] ?? 0,
            'note' => $data['note'] ?? null,
            'updated_at' => now(),
        ];

        if ($existing) {
            DB::table('succession_candidates')->where('id', $existing->id)->update($payload);
            return response()->json(DB::table('succession_candidates')->where('id', $existing->id)->first());
        }

        $id = (string) Str::uuid();
        DB::table('succession_candidates')->insert($payload + [
            'id' => $id,
            'company_id' => $companyId,
            'plan_id' => $planId,
            'user_id' => $data['user_id'],
            'created_at' => now(),
        ]);
        return response()->json(DB::table('succession_candidates')->where('id', $id)->first(), 201);
    }

    public function destroyCandidate(string $planId, string $candidateId, Request $request): JsonResponse
    {
        $this->assertHr($request);
        DB::table('succession_candidates')->where('plan_id', $planId)->where('id', $candidateId)->delete();
        return response()->json(['ok' => true]);
    }

    // ================= helpers =================

    private function boxOf(int $perfLevel, int $potLevel, int $cols): int
    {
        $perfLevel = max(1, min($perfLevel, $cols));
        $potLevel = max(1, min($potLevel, 3));
        return ($potLevel - 1) * $cols + $perfLevel;
    }

    /** Мэппинг сырого балла (0..5) в уровень сетки. */
    private function scoreToLevel(?float $score, int $cols): int
    {
        if ($score === null) return 2;
        if ($cols === 4) {
            if ($score < 2.5) return 1;
            if ($score < 3.5) return 2;
            if ($score < 4.3) return 3;
            return 4;
        }
        if ($score < 3.0) return 1;
        if ($score < 4.0) return 2;
        return 3;
    }

    private function findSession(string $id, Request $request)
    {
        $session = DB::table('talent_review_sessions')
            ->where('id', $id)
            ->where('company_id', $this->companyId($request))
            ->first();
        if (!$session) abort(404);
        return $session;
    }

    private function assertHr(Request $request): void
    {
        if (!$this->isHr($request->user())) abort(403);
    }

    private function isHr($user): bool
    {
        if (!$user) return false;
        try {
            return $user->hasRole('hrd') || $user->hasRole('hr')
                || $user->hasRole('company_admin') || $user->hasRole('superadmin');
        } catch (\Throwable) {
            return false;
        }
    }

    private function userId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) return null;
        return (string) $user->getAuthIdentifier();
    }

    private function companyId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) return null;
        try {
            if (method_exists($user, 'companyId')) {
                $cid = $user->companyId();
                if ($cid) return (string) $cid;
            }
        } catch (\Throwable) {
            // fall through
        }
        if (Schema::hasTable('profiles')) {
            $cid = DB::table('profiles')->where('user_id', $this->userId($request))->value('company_id');
            if ($cid) return (string) $cid;
        }
        return null;
    }
}
