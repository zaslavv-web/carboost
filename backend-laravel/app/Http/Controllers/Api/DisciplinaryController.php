<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DisciplinaryCriterion;
use App\Models\DisciplinaryRecord;
use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Реестр предупреждений / PIP / Observation + чек-лист критериев выхода.
 */
class DisciplinaryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $request->get('scope', 'mine');
        $q = DisciplinaryRecord::query()->with('criteria');

        if ($scope === 'mine') {
            $q->where('user_id', $user->getAuthIdentifier());
        } elseif ($scope === 'team') {
            $ids = TeamMember::where('manager_id', $user->getAuthIdentifier())->pluck('employee_id');
            $q->whereIn('user_id', $ids);
        } elseif ($scope === 'all' && !$this->isHr($user)) {
            abort(403);
        }
        if ($type = $request->get('type')) $q->where('type', $type);
        if ($status = $request->get('status')) $q->where('status', $status);
        return response()->json($q->orderByDesc('issued_at')->paginate(100));
    }

    public function show(string $id, Request $request): JsonResponse
    {
        $r = DisciplinaryRecord::with('criteria')->findOrFail($id);
        $this->assertCanView($request->user(), $r);
        return response()->json($r);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$this->isHr($user) && !$user->hasRole('manager')) abort(403);
        $data = $request->validate([
            'user_id'     => 'required|uuid',
            'type'        => 'required|in:warning,pip,observation',
            'severity'    => 'sometimes|in:low,medium,high',
            'reason'      => 'required|string|max:5000',
            'valid_until' => 'nullable|date',
            'criteria'    => 'nullable|array',
            'criteria.*.title'       => 'required_with:criteria|string|max:255',
            'criteria.*.description' => 'nullable|string|max:2000',
        ]);

        return DB::transaction(function () use ($data, $user) {
            $rec = DisciplinaryRecord::create([
                'user_id'     => $data['user_id'],
                'type'        => $data['type'],
                'severity'    => $data['severity'] ?? 'medium',
                'reason'      => $data['reason'],
                'valid_until' => $data['valid_until'] ?? null,
                'issued_by'   => $user->getAuthIdentifier(),
                'issued_at'   => now(),
                'status'      => 'active',
            ]);
            foreach ($data['criteria'] ?? [] as $c) {
                DisciplinaryCriterion::create([
                    'record_id'   => $rec->id,
                    'title'       => $c['title'],
                    'description' => $c['description'] ?? null,
                ]);
            }
            $labels = ['warning' => 'Вынесено предупреждение', 'pip' => 'Открыт PIP', 'observation' => 'Назначено наблюдение'];
            $this->notify($data['user_id'], $rec->company_id, $labels[$data['type']], $data['reason'], 'disciplinary');
            return response()->json($rec->fresh('criteria'), 201);
        });
    }

    public function addCriterion(string $id, Request $request): JsonResponse
    {
        $r = DisciplinaryRecord::findOrFail($id);
        if (!$this->canManage($request->user(), $r)) abort(403);
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
        ]);
        $c = DisciplinaryCriterion::create($data + ['record_id' => $id]);
        return response()->json($c, 201);
    }

    public function toggleCriterion(string $id, string $criterionId, Request $request): JsonResponse
    {
        $r = DisciplinaryRecord::findOrFail($id);
        if (!$this->canManage($request->user(), $r)) abort(403);
        $c = DisciplinaryCriterion::where('record_id', $id)->findOrFail($criterionId);
        $met = !$c->is_met;
        $c->update([
            'is_met'    => $met,
            'met_at'    => $met ? now() : null,
            'marked_by' => $request->user()->getAuthIdentifier(),
            'evidence_url' => $request->input('evidence_url', $c->evidence_url),
            'comment'   => $request->input('comment', $c->comment),
        ]);
        return response()->json($c);
    }

    public function deleteCriterion(string $id, string $criterionId, Request $request): JsonResponse
    {
        $r = DisciplinaryRecord::findOrFail($id);
        if (!$this->canManage($request->user(), $r)) abort(403);
        DisciplinaryCriterion::where('record_id', $id)->where('id', $criterionId)->delete();
        return response()->json(null, 204);
    }

    public function close(string $id, Request $request): JsonResponse
    {
        $user = $request->user();
        $r = DisciplinaryRecord::findOrFail($id);
        if (!$this->canManage($user, $r)) abort(403);
        $data = $request->validate([
            'closure_reason' => 'required|string|max:2000',
            'status'         => 'sometimes|in:closed,escalated',
        ]);
        $r->update([
            'status'         => $data['status'] ?? 'closed',
            'closure_reason' => $data['closure_reason'],
            'closed_at'      => now(),
            'closed_by'      => $user->getAuthIdentifier(),
        ]);
        $this->notify($r->user_id, $r->company_id,
            $r->status === 'escalated' ? 'Эскалация по дисциплинарной записи' : 'Дисциплинарная запись закрыта',
            $data['closure_reason'], 'disciplinary');
        return response()->json($r->fresh('criteria'));
    }

    // ===== helpers =====
    private function isHr($user): bool
    {
        return $user && ($user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
    }
    private function canManage($user, DisciplinaryRecord $r): bool
    {
        return $this->isHr($user) || TeamMember::where('manager_id', $user->getAuthIdentifier())->where('employee_id', $r->user_id)->exists();
    }
    private function assertCanView($user, DisciplinaryRecord $r): void
    {
        if ($r->user_id === $user->getAuthIdentifier()) return;
        if ($this->canManage($user, $r)) return;
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
