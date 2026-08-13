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
    public function tasks(Request $request): JsonResponse
    {
        $userId = $this->verifiedUserId($request);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }

        $rows = DB::table('tracker_tasks')
            ->where('assignee_id', $userId)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get([
                'id', 'company_id', 'project_id', 'assignee_id', 'type', 'title',
                'status', 'workflow_status_id', 'urgency', 'priority',
                'story_points', 'estimate_minutes', 'due_at', 'start_at',
                'completed_at', 'created_at', 'updated_at',
            ]);

        return $this->lightResponse(['data' => $rows]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $userId = $this->verifiedUserId($request);
        if ($userId instanceof JsonResponse) {
            return $userId;
        }

        $rows = DB::table('notifications')
            ->where('user_id', $userId)
            ->where('is_read', false)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get([
                'id', 'title', 'description', 'notification_type',
                'created_at', 'is_read',
            ]);

        return $this->lightResponse([
            'data' => $rows,
            'unread_count' => $rows->count(),
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
            ->header('X-Db-Read-Path', 'owner-light-v1')
            ->header('X-PHP-Peak-MB', (string) round(memory_get_peak_usage(false) / 1048576, 1))
            ->header('X-Zend-Peak-MB', (string) round(memory_get_peak_usage(true) / 1048576, 1));
    }
}