<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestFile;
use App\Models\LeaveType;
use App\Models\TeamMember;
use App\Models\TeamMemberSubstitution;
use App\Services\LeaveCalculatorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

/**
 * Заявки на отсутствие (отпуск, больничный, декрет, учёба, отгул).
 *
 * Workflow:
 *   pending_manager → pending_hr → approved
 *                  ↘ rejected
 *   approved + substitute_user_id ⇒ запись в team_member_substitutions.
 */
class LeaveRequestController extends Controller
{
    public function __construct(private LeaveCalculatorService $calc) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = LeaveRequest::query()->with(['leaveType', 'files']);

        $scope = $request->get('scope', 'mine'); // mine | inbox | all
        if ($scope === 'mine') {
            $query->where('user_id', $user->getAuthIdentifier());
        } elseif ($scope === 'inbox') {
            // Менеджеру — заявки его подчинённых на стадии pending_manager.
            // HRD/admin — все pending_hr своей компании.
            $isHr = $user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin');
            if ($isHr) {
                $query->where('status', 'pending_hr');
            } else {
                $subordinateIds = TeamMember::query()
                    ->where('manager_id', $user->getAuthIdentifier())
                    ->pluck('employee_id');
                $query->where('status', 'pending_manager')
                      ->whereIn('user_id', $subordinateIds);
            }
        }

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }

        return response()->json($query->orderByDesc('created_at')->paginate(50));
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'leave_type_id'      => 'required|uuid',
            'start_date'         => 'required|date',
            'end_date'           => 'required|date|after_or_equal:start_date',
            'reason'             => 'nullable|string|max:1000',
            'substitute_user_id' => 'nullable|uuid',
            'files'              => 'sometimes|array',
            'files.*.file_url'   => 'required_with:files|string',
            'files.*.file_name'  => 'nullable|string|max:255',
        ]);

        $type = LeaveType::findOrFail($data['leave_type_id']);
        if ($type->requires_medical_cert && empty($data['files'])) {
            return response()->json(['error' => 'Для этого типа требуется медсправка'], 422);
        }

        $days = $this->calc->calculateBusinessDays($data['start_date'], $data['end_date']);

        $req = DB::transaction(function () use ($user, $data, $days, $type) {
            $req = LeaveRequest::create([
                'user_id'            => $user->getAuthIdentifier(),
                'leave_type_id'      => $data['leave_type_id'],
                'start_date'         => $data['start_date'],
                'end_date'           => $data['end_date'],
                'days_count'         => $days,
                'reason'             => $data['reason'] ?? null,
                'status'             => 'pending_manager',
                'substitute_user_id' => $data['substitute_user_id'] ?? null,
            ]);

            // Для больничных рассчитаем разбиение paid/unpaid (фиксируется при подаче).
            if (in_array($type->code, ['sick_paid', 'sick_unpaid'], true)) {
                $split = $this->calc->splitSickPaidUnpaid($user->getAuthIdentifier(), $days);
                $req->update(['paid_days' => $split['paid'], 'unpaid_days' => $split['unpaid']]);
            }

            foreach ($data['files'] ?? [] as $f) {
                LeaveRequestFile::create([
                    'request_id'  => $req->id,
                    'file_url'    => $f['file_url'],
                    'file_name'   => $f['file_name'] ?? null,
                    'uploaded_by' => $user->getAuthIdentifier(),
                ]);
            }

            // Уведомление руководителю(ям).
            $managerIds = TeamMember::query()
                ->where('employee_id', $user->getAuthIdentifier())
                ->pluck('manager_id');
            foreach ($managerIds as $mid) {
                $this->insertNotification(
                    $mid, $req->company_id,
                    'Новая заявка на отсутствие',
                    'Сотрудник подал заявку на ' . $type->title . ' (' . $days . ' дн.)',
                    'leave_request',
                );
            }

            return $req;
        });

        return response()->json($req->fresh(['leaveType', 'files']), 201);
    }

    public function show(string $id, Request $request): JsonResponse
    {
        $req = LeaveRequest::with(['leaveType', 'files'])->findOrFail($id);
        $this->assertCanView($request->user(), $req);
        return response()->json($req);
    }

    public function approve(string $id, Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['comment' => 'nullable|string|max:500']);
        $req  = LeaveRequest::findOrFail($id);

        return DB::transaction(function () use ($req, $user, $data) {
            if ($req->status === 'pending_manager') {
                if (!$this->isManagerOf($user, $req->user_id) && !$this->isHr($user)) {
                    return response()->json(['error' => 'Нет прав на согласование'], 403);
                }
                $req->update([
                    'status'              => 'pending_hr',
                    'manager_id'          => $user->getAuthIdentifier(),
                    'manager_decision_at' => now(),
                    'manager_comment'     => $data['comment'] ?? null,
                ]);
                $this->notifyHr($req);
                $this->notifyEmployee($req, '✅ Руководитель согласовал заявку, ожидает HR.');
            } elseif ($req->status === 'pending_hr') {
                if (!$this->isHr($user)) {
                    return response()->json(['error' => 'Согласование на этой стадии доступно только HR'], 403);
                }
                $req->update([
                    'status'         => 'approved',
                    'hr_id'          => $user->getAuthIdentifier(),
                    'hr_decision_at' => now(),
                    'hr_comment'     => $data['comment'] ?? null,
                ]);
                $this->applyApprovalSideEffects($req);
                $this->notifyEmployee($req, '🎉 HR подтвердил заявку. Отсутствие согласовано.');
            } else {
                return response()->json(['error' => 'Заявка уже обработана'], 422);
            }
            return response()->json($req->fresh(['leaveType', 'files']));
        });
    }

    public function reject(string $id, Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['comment' => 'required|string|max:500']);
        $req  = LeaveRequest::findOrFail($id);

        if (!in_array($req->status, ['pending_manager', 'pending_hr'], true)) {
            return response()->json(['error' => 'Заявка уже обработана'], 422);
        }
        $isManager = $this->isManagerOf($user, $req->user_id);
        $isHr = $this->isHr($user);
        if (!$isManager && !$isHr) {
            return response()->json(['error' => 'Нет прав на отклонение'], 403);
        }

        $req->update([
            'status'              => 'rejected',
            'manager_comment'     => $isManager ? $data['comment'] : $req->manager_comment,
            'manager_decision_at' => $isManager ? now() : $req->manager_decision_at,
            'manager_id'          => $isManager ? $user->getAuthIdentifier() : $req->manager_id,
            'hr_comment'          => $isHr ? $data['comment'] : $req->hr_comment,
            'hr_decision_at'      => $isHr ? now() : $req->hr_decision_at,
            'hr_id'               => $isHr ? $user->getAuthIdentifier() : $req->hr_id,
        ]);
        $this->notifyEmployee($req, '⚠️ Заявка отклонена. Причина: ' . $data['comment']);
        return response()->json($req->fresh(['leaveType', 'files']));
    }

    public function cancel(string $id, Request $request): JsonResponse
    {
        $user = $request->user();
        $req  = LeaveRequest::findOrFail($id);
        if ($req->user_id !== $user->getAuthIdentifier()) {
            return response()->json(['error' => 'Можно отменить только свою заявку'], 403);
        }
        if (!in_array($req->status, ['pending_manager', 'pending_hr'], true)) {
            return response()->json(['error' => 'Заявку уже нельзя отменить'], 422);
        }
        $req->update(['status' => 'cancelled']);
        return response()->json($req->fresh(['leaveType', 'files']));
    }

    // ---- helpers ----

    private function isHr($user): bool
    {
        return $user && ($user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
    }

    private function isManagerOf($user, string $employeeId): bool
    {
        if (!$user) return false;
        return TeamMember::query()
            ->where('manager_id', $user->getAuthIdentifier())
            ->where('employee_id', $employeeId)
            ->exists();
    }

    private function assertCanView($user, LeaveRequest $req): void
    {
        if ($req->user_id === $user->getAuthIdentifier()) return;
        if ($this->isHr($user) && $req->company_id === $user->companyId()) return;
        if ($this->isManagerOf($user, $req->user_id)) return;
        abort(403, 'Нет доступа к заявке');
    }

    private function applyApprovalSideEffects(LeaveRequest $req): void
    {
        // 1) Списываем дни с баланса.
        $balance = LeaveBalance::firstOrCreate(
            ['user_id' => $req->user_id, 'leave_type_id' => $req->leave_type_id],
            ['company_id' => $req->company_id]
        );
        $balance->increment('used_days', (float) $req->days_count);

        // 2) Замещение — если указан substitute_user_id.
        if ($req->substitute_user_id) {
            TeamMemberSubstitution::create([
                'original_user_id'   => $req->user_id,
                'substitute_user_id' => $req->substitute_user_id,
                'company_id'         => $req->company_id,
                'start_date'         => $req->start_date,
                'end_date'           => $req->end_date,
                'leave_request_id'   => $req->id,
            ]);
            $this->insertNotification(
                $req->substitute_user_id, $req->company_id,
                'Вы назначены замещающим',
                'Период: ' . $req->start_date->format('d.m.Y') . ' — ' . $req->end_date->format('d.m.Y'),
                'substitution',
            );
        }
    }

    private function notifyHr(LeaveRequest $req): void
    {
        $hrIds = DB::table('user_roles')
            ->join('profiles', 'profiles.user_id', '=', 'user_roles.user_id')
            ->whereIn('user_roles.role', ['hrd', 'company_admin'])
            ->where('profiles.company_id', $req->company_id)
            ->pluck('user_roles.user_id')
            ->unique();
        foreach ($hrIds as $uid) {
            $this->insertNotification(
                $uid, $req->company_id,
                'Заявка ожидает подтверждения HR',
                'Руководитель согласовал заявку на отсутствие, требуется ваше решение.',
                'leave_request',
            );
        }
    }

    private function notifyEmployee(LeaveRequest $req, string $text): void
    {
        $this->insertNotification(
            $req->user_id, $req->company_id,
            'Статус заявки изменён',
            $text,
            'leave_request',
        );
    }

    /** Прямая вставка в notifications: модель использует устаревшие имена fillable. */
    private function insertNotification(string $userId, ?string $companyId, string $title, string $description, string $type): void
    {
        DB::table('notifications')->insert([
            'id'                => (string) Str::uuid(),
            'user_id'           => $userId,
            'company_id'        => $companyId,
            'title'             => $title,
            'description'       => $description,
            'notification_type' => $type,
            'is_read'           => false,
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);
    }
}
