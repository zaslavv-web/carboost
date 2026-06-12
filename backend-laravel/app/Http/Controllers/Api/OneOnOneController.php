<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OneOnOneMeeting;
use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Встречи 1:1 руководитель↔сотрудник (для probation / disciplinary / general).
 */
class OneOnOneController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $q = OneOnOneMeeting::query();
        $scope = $request->get('scope', 'mine'); // mine|managing|all
        if ($scope === 'mine') {
            $q->where(function ($w) use ($user) {
                $w->where('employee_id', $user->getAuthIdentifier())
                  ->orWhere('manager_id', $user->getAuthIdentifier());
            });
        } elseif ($scope === 'managing') {
            $q->where('manager_id', $user->getAuthIdentifier());
        } elseif ($scope === 'all' && !$this->isHr($user)) {
            abort(403);
        }
        if ($empId = $request->get('employee_id')) $q->where('employee_id', $empId);
        if ($relType = $request->get('related_type')) $q->where('related_type', $relType);
        if ($relId = $request->get('related_id')) $q->where('related_id', $relId);
        return response()->json($q->orderBy('scheduled_at')->paginate(100));
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'employee_id'  => 'required|uuid',
            'scheduled_at' => 'required|date',
            'duration_min' => 'sometimes|integer|min:5|max:480',
            'agenda'       => 'nullable|string|max:2000',
            'related_type' => 'nullable|in:probation,disciplinary,performance',
            'related_id'   => 'nullable|uuid',
        ]);
        if (!$this->isHr($user) && !$this->isManagerOf($user, $data['employee_id'])) abort(403);

        $m = OneOnOneMeeting::create($data + ['manager_id' => $user->getAuthIdentifier(), 'status' => 'scheduled']);
        $this->notify($data['employee_id'], $m->company_id,
            'Запланирована встреча 1:1',
            'Когда: ' . $m->scheduled_at->format('d.m.Y H:i'),
            'one_on_one',
        );
        return response()->json($m, 201);
    }

    public function update(string $id, Request $request): JsonResponse
    {
        $m = OneOnOneMeeting::findOrFail($id);
        $user = $request->user();
        if ($m->manager_id !== $user->getAuthIdentifier() && !$this->isHr($user)) abort(403);
        $m->update($request->only(['scheduled_at','duration_min','agenda','notes','status']));
        return response()->json($m);
    }

    public function destroy(string $id, Request $request): JsonResponse
    {
        $m = OneOnOneMeeting::findOrFail($id);
        $user = $request->user();
        if ($m->manager_id !== $user->getAuthIdentifier() && !$this->isHr($user)) abort(403);
        $m->delete();
        return response()->json(null, 204);
    }

    private function isHr($user): bool
    {
        return $user && ($user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
    }
    private function isManagerOf($user, string $employeeId): bool
    {
        return TeamMember::where('manager_id', $user->getAuthIdentifier())->where('employee_id', $employeeId)->exists();
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
