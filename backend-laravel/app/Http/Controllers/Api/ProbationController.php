<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProbationCriterion;
use App\Models\ProbationPeriod;
use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Испытательные сроки + чек-лист критериев + решение (passed/extended/failed).
 */
class ProbationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $request->get('scope', 'mine'); // mine|team|all
        $q = ProbationPeriod::query()->with('criteria');

        if ($scope === 'mine') {
            $q->where('user_id', $user->getAuthIdentifier());
        } elseif ($scope === 'team') {
            $ids = TeamMember::where('manager_id', $user->getAuthIdentifier())->pluck('employee_id');
            $q->whereIn('user_id', $ids);
        } elseif ($scope === 'all' && !$this->isHr($user)) {
            abort(403);
        }
        if ($status = $request->get('status')) $q->where('status', $status);
        return response()->json($q->orderByDesc('end_date')->paginate(100));
    }

    public function show(string $id, Request $request): JsonResponse
    {
        $p = ProbationPeriod::with('criteria')->findOrFail($id);
        $this->assertCanView($request->user(), $p);
        return response()->json($p);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$this->isHr($user) && !$user->hasRole('manager')) abort(403);
        $data = $request->validate([
            'user_id'    => 'required|uuid',
            'start_date' => 'required|date',
            'end_date'   => 'required|date|after:start_date',
            'manager_id' => 'nullable|uuid',
            'hr_id'      => 'nullable|uuid',
            'goals'      => 'nullable|string|max:5000',
            'criteria'   => 'nullable|array',
            'criteria.*.title'       => 'required_with:criteria|string|max:255',
            'criteria.*.description' => 'nullable|string|max:2000',
            'criteria.*.weight'      => 'nullable|numeric|min:0',
        ]);

        return DB::transaction(function () use ($data, $user) {
            $p = ProbationPeriod::create([
                'user_id'    => $data['user_id'],
                'manager_id' => $data['manager_id'] ?? $user->getAuthIdentifier(),
                'hr_id'      => $data['hr_id'] ?? null,
                'start_date' => $data['start_date'],
                'end_date'   => $data['end_date'],
                'goals'      => $data['goals'] ?? null,
                'status'     => 'active',
            ]);
            foreach ($data['criteria'] ?? [] as $c) {
                ProbationCriterion::create([
                    'probation_id' => $p->id,
                    'title'        => $c['title'],
                    'description'  => $c['description'] ?? null,
                    'weight'       => $c['weight'] ?? 1,
                ]);
            }
            $this->notify($data['user_id'], $p->company_id,
                'Назначен испытательный срок',
                'Период: ' . $p->start_date->format('d.m.Y') . ' — ' . $p->end_date->format('d.m.Y'),
                'probation',
            );
            return response()->json($p->fresh('criteria'), 201);
        });
    }

    public function update(string $id, Request $request): JsonResponse
    {
        $p = ProbationPeriod::findOrFail($id);
        if (!$this->isHr($request->user()) && $p->manager_id !== $request->user()->getAuthIdentifier()) abort(403);
        $p->update($request->only(['end_date','goals','manager_id','hr_id']));
        return response()->json($p->fresh('criteria'));
    }

    public function addCriterion(string $id, Request $request): JsonResponse
    {
        $p = ProbationPeriod::findOrFail($id);
        if (!$this->canManage($request->user(), $p)) abort(403);
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'weight' => 'nullable|numeric|min:0',
        ]);
        $c = ProbationCriterion::create($data + ['probation_id' => $id]);
        return response()->json($c, 201);
    }

    public function toggleCriterion(string $id, string $criterionId, Request $request): JsonResponse
    {
        $p = ProbationPeriod::findOrFail($id);
        if (!$this->canManage($request->user(), $p)) abort(403);
        $c = ProbationCriterion::where('probation_id', $id)->findOrFail($criterionId);
        $met = !$c->is_met;
        $c->update([
            'is_met'    => $met,
            'met_at'    => $met ? now() : null,
            'marked_by' => $request->user()->getAuthIdentifier(),
            'comment'   => $request->input('comment', $c->comment),
        ]);
        return response()->json($c);
    }

    public function deleteCriterion(string $id, string $criterionId, Request $request): JsonResponse
    {
        $p = ProbationPeriod::findOrFail($id);
        if (!$this->canManage($request->user(), $p)) abort(403);
        ProbationCriterion::where('probation_id', $id)->where('id', $criterionId)->delete();
        return response()->json(null, 204);
    }

    public function decide(string $id, Request $request): JsonResponse
    {
        $user = $request->user();
        $p = ProbationPeriod::findOrFail($id);
        if (!$this->canManage($user, $p)) abort(403);
        $data = $request->validate([
            'decision'      => 'required|in:passed,extended,failed',
            'extended_to'   => 'required_if:decision,extended|date',
            'decision_notes' => 'nullable|string|max:5000',
        ]);
        $p->update([
            'status'         => $data['decision'],
            'extended_to'    => $data['extended_to'] ?? null,
            'decision_at'    => now(),
            'decision_by'    => $user->getAuthIdentifier(),
            'decision_notes' => $data['decision_notes'] ?? null,
        ]);
        $titles = ['passed' => 'Испытательный срок пройден', 'extended' => 'Испытательный срок продлён', 'failed' => 'Испытательный срок не пройден'];
        $this->notify($p->user_id, $p->company_id, $titles[$data['decision']], $data['decision_notes'] ?? '', 'probation');
        return response()->json($p->fresh('criteria'));
    }

    // ===== helpers =====
    private function isHr($user): bool
    {
        return $user && ($user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
    }
    private function canManage($user, ProbationPeriod $p): bool
    {
        return $this->isHr($user) || $p->manager_id === $user->getAuthIdentifier();
    }
    private function assertCanView($user, ProbationPeriod $p): void
    {
        if ($p->user_id === $user->getAuthIdentifier()) return;
        if ($this->canManage($user, $p)) return;
        abort(403);
    }
    private function notify(string $userId, ?string $companyId, string $title, string $description, string $type): void
    {
        DB::table('notifications')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $userId, 'company_id' => $companyId,
            'title' => $title, 'description' => $description,
            'notification_type' => $type, 'is_read' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
