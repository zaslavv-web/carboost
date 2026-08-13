<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Небольшие owner-only выборки для оболочки сотрудника.
 *
 * Эти маршруты намеренно не проходят generic DbController: экран Today не
 * должен запрашивать метаданные таблиц и материализовывать сотни полных строк.
 */
class EmployeeReadController extends Controller
{
    public function today(Request $request): JsonResponse
    {
        $userId = $this->verifiedUserId($request);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }

        $tasks = $this->taskRows($userId);
        $notifications = $this->notificationRows($userId);
        $competencies = DB::table('competencies')
            ->where('user_id', $userId)
            ->limit(200)
            ->get(['skill_value']);
        $goals = DB::table('career_goals')
            ->where('user_id', $userId)
            ->orderBy('created_at')
            ->limit(100)
            ->get(['id', 'title', 'status', 'progress']);

        return $this->lightResponse([
            'tasks' => $tasks,
            'notifications' => $notifications,
            'unread_count' => $notifications->count(),
            'competencies' => $competencies,
            'goals' => $goals,
        ]);
    }

    public function tasks(Request $request): JsonResponse
    {
        $userId = $this->verifiedUserId($request);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }

        return $this->lightResponse(['data' => $this->taskRows($userId)]);
    }

    private function taskRows(string|int $userId)
    {
        $rows = DB::table('tracker_tasks')
            ->where('assignee_id', $userId)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get([
                'id', 'company_id', 'project_id', 'sprint_id', 'author_id',
                'assignee_id', 'parent_task_id', 'type', 'title',
                'status', 'workflow_status_id', 'urgency', 'priority',
                'story_points', 'estimate_minutes', 'labels', 'order_index',
                'due_at', 'start_at', 'jira_key', 'completed_at',
                'created_at', 'updated_at',
            ]);

        $rows->transform(function (object $row): object {
            $row->description = null;
            if (is_string($row->labels)) {
                $row->labels = json_decode($row->labels, true);
            }
            return $row;
        });

        return $rows;
    }

    public function notifications(Request $request): JsonResponse
    {
        $userId = $this->verifiedUserId($request);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }

        $rows = $this->notificationRows($userId);

        return $this->lightResponse([
            'data' => $rows,
            'unread_count' => $rows->count(),
        ]);
    }

    private function notificationRows(string|int $userId)
    {
        return DB::table('notifications')
            ->where('user_id', $userId)
            ->where('is_read', false)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get([
                'id', 'title', 'description', 'notification_type',
                'created_at', 'is_read',
            ]);
    }

    /** @return string|int|JsonResponse */
    private function verifiedUserId(Request $request): string|int|JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Не авторизован'], 401);
        }

        $profile = DB::table('profiles')
            ->where('user_id', $user->getAuthIdentifier())
            ->first(['company_id', 'is_verified']);

        if (! $profile || ! $profile->is_verified) {
            return response()->json([
                'message' => 'Учётная запись ожидает подтверждения суперадминистратором',
                'code' => 'pending_verification',
            ], 403);
        }
        if (! $profile->company_id) {
            return response()->json([
                'message' => 'Не указана компания. Завершите регистрацию.',
                'code' => 'missing_company',
            ], 403);
        }

        return $user->getAuthIdentifier();
    }

    private function lightResponse(array $payload): JsonResponse
    {
        return response()->json($payload)
            ->header('X-Db-Read-Path', 'owner-light-v2')
            ->header('X-PHP-Peak-MB', (string) round(memory_get_peak_usage(false) / 1048576, 1))
            ->header('X-Zend-Peak-MB', (string) round(memory_get_peak_usage(true) / 1048576, 1));
    }
}