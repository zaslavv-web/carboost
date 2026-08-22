<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Агрегированные данные для карты сотрудников.
 *
 * Раньше карта делала четыре широких запроса через generic DbController
 * (включая hr_tasks с select * и полный список исполнителей), из-за чего
 * первый рендер занимал секунды. Здесь — один ответ с явными полями.
 */
class HrdMapController extends Controller
{
    private const ALLOWED_ROLES = ['hr', 'hrd', 'company_admin', 'manager', 'superadmin'];

    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['message' => 'Не авторизован'], 401);
        }
        $userId = $user->getAuthIdentifier();

        $roles = DB::table('user_roles')->where('user_id', $userId)->pluck('role')->all();
        if (! array_intersect($roles, self::ALLOWED_ROLES)) {
            return response()->json(['message' => 'Недостаточно прав'], 403);
        }

        $companyId = DB::table('profiles')->where('user_id', $userId)->value('company_id');
        if (! $companyId) {
            return response()->json(['message' => 'Не указана компания'], 403);
        }

        $employees = DB::table('profiles')
            ->where('company_id', $companyId)
            ->orderBy('full_name')
            ->limit(5000)
            ->get(['user_id', 'full_name', 'position', 'department', 'avatar_url', 'overall_score', 'role_readiness']);

        $teamLinks = DB::table('team_members')
            ->where('company_id', $companyId)
            ->limit(10000)
            ->get(['manager_id', 'employee_id']);

        $tasks = DB::table('hr_tasks')
            ->where('company_id', $companyId)
            ->orderByDesc('created_at')
            ->limit(300)
            ->get([
                'id', 'title', 'category', 'reward_coins', 'deadline', 'status',
                'created_by', 'created_at', 'reviewed_at', 'audience_rules',
            ]);

        $taskIds = $tasks->pluck('id')->all();
        $assignees = $taskIds
            ? DB::table('hr_task_assignees')->whereIn('task_id', $taskIds)
                ->get(['task_id', 'user_id', 'individual_status', 'reward_paid'])
            : collect();
        $byTask = $assignees->groupBy('task_id');

        $tasks->transform(function (object $t) use ($byTask): object {
            $t->description = null;
            if (is_string($t->audience_rules)) {
                $decoded = json_decode($t->audience_rules, true);
                $t->audience_rules = is_array($decoded) ? $decoded : null;
            }
            $t->assignees = ($byTask[$t->id] ?? collect())->map(fn ($a) => [
                'user_id' => $a->user_id,
                'individual_status' => $a->individual_status,
                'reward_paid' => (bool) $a->reward_paid,
            ])->values();
            return $t;
        });

        $balances = DB::table('currency_balances')
            ->where('company_id', $companyId)
            ->limit(5000)
            ->get(['user_id', 'balance']);

        return response()->json([
            'employees' => $employees,
            'team_links' => $teamLinks,
            'hr_tasks' => $tasks,
            'balances' => $balances,
        ])->header('X-Db-Read-Path', 'hrd-map-v1');
    }
}
