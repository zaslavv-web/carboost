<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * HR-задачи с динамической аудиторией (отдел / должность / грейд).
 *
 * Задача хранит правило в hr_tasks.audience_rules; исполнители
 * материализуются в hr_task_assignees и досоздаются при синхронизации
 * (открытие карты сотрудников, изменение профиля сотрудника).
 */
class HrTaskAudienceController extends Controller
{
    protected function canManage(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hr', 'hrd', 'company_admin', 'superadmin', 'manager']);
    }

    protected function companyId(): ?string
    {
        $u = Auth::user();
        if (! $u) return null;
        return method_exists($u, 'companyId')
            ? $u->companyId()
            : DB::table('profiles')->where('user_id', $u->id)->value('company_id');
    }

    /** Справочники: отделы, должности, грейды компании. */
    public function options(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = $this->companyId();

        $departments = DB::table('profiles')->where('company_id', $companyId)
            ->whereNotNull('department')->where('department', '!=', '')
            ->distinct()->orderBy('department')->pluck('department')->values();

        $positions = DB::table('positions')->where('company_id', $companyId)
            ->orderBy('title')->get(['id', 'title']);

        $grades = DB::table('profiles')->where('company_id', $companyId)
            ->whereNotNull('grade')->where('grade', '!=', '')
            ->distinct()->orderBy('grade')->pluck('grade')->values();

        return response()->json(compact('departments', 'positions', 'grades'));
    }

    /** Валидация и нормализация правил из запроса. */
    public static function normalizeRules(array $raw): array
    {
        $out = [];
        foreach (['departments', 'grades', 'position_ids', 'user_ids'] as $key) {
            $vals = array_values(array_filter(array_map(
                fn ($v) => is_string($v) ? trim($v) : $v,
                (array) ($raw[$key] ?? [])
            ), fn ($v) => $v !== null && $v !== ''));
            if ($vals) $out[$key] = array_values(array_unique(array_map('strval', $vals)));
        }
        return $out;
    }

    /** Разрешение правил в список user_id внутри компании. */
    public static function resolve(array $rules, ?string $companyId): array
    {
        if (! $companyId) return [];
        $rules = self::normalizeRules($rules);
        $ids = [];

        if (! empty($rules['user_ids'])) {
            $ids = array_merge($ids, DB::table('profiles')
                ->where('company_id', $companyId)
                ->whereIn('user_id', $rules['user_ids'])
                ->pluck('user_id')->all());
        }

        $hasFilters = ! empty($rules['departments']) || ! empty($rules['grades']) || ! empty($rules['position_ids']);
        if ($hasFilters) {
            $q = DB::table('profiles')->where('company_id', $companyId);
            if (! empty($rules['departments'])) $q->whereIn('department', $rules['departments']);
            if (! empty($rules['grades'])) $q->whereIn('grade', $rules['grades']);
            if (! empty($rules['position_ids'])) $q->whereIn('position_id', $rules['position_ids']);
            $ids = array_merge($ids, $q->pluck('user_id')->all());
        }

        return array_values(array_unique(array_map('strval', $ids)));
    }

    /** Предпросмотр: сколько сотрудников попадает под правило. */
    public function preview(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = $this->companyId();
        $ids = self::resolve((array) $r->all(), $companyId);

        $users = $ids
            ? DB::table('profiles')->where('company_id', $companyId)->whereIn('user_id', $ids)
                ->orderBy('full_name')->limit(200)
                ->get(['user_id', 'full_name', 'department', 'position'])
            : collect();

        return response()->json(['count' => count($ids), 'users' => $users]);
    }

    /** Создание задачи: точечные исполнители или динамическая аудитория. */
    public function store(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'company required'], 422);

        $data = $r->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'category' => 'nullable|string|max:64',
            'reward_coins' => 'nullable|integer|min:0|max:1000000',
            'deadline' => 'nullable|date',
            'assignee_ids' => 'nullable|array',
            'assignee_ids.*' => 'nullable|string|max:64',
            'audience' => 'nullable|array',
        ]);

        $rules = self::normalizeRules((array) ($data['audience'] ?? []));
        $explicit = array_values(array_filter((array) ($data['assignee_ids'] ?? [])));

        $taskId = (string) Str::uuid();
        DB::table('hr_tasks')->insert([
            'id' => $taskId,
            'company_id' => $companyId,
            'created_by' => Auth::id(),
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'category' => $data['category'] ?? 'other',
            'reward_coins' => (int) ($data['reward_coins'] ?? 0),
            'deadline' => $data['deadline'] ?? null,
            'status' => 'assigned',
            'audience_rules' => $rules ? json_encode($rules, JSON_UNESCAPED_UNICODE) : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $userIds = $explicit;
        if ($rules) {
            $userIds = array_merge($userIds, self::resolve($rules, $companyId));
        }
        $added = self::materialize($taskId, array_unique($userIds));

        return response()->json(['id' => $taskId, 'assignees' => $added], 201);
    }

    /** Создаёт недостающие записи исполнителей, возвращает итоговое число. */
    public static function materialize(string $taskId, array $userIds): int
    {
        $userIds = array_values(array_unique(array_filter(array_map('strval', $userIds))));
        if (! $userIds) return 0;

        $existing = DB::table('hr_task_assignees')->where('task_id', $taskId)
            ->pluck('user_id')->map('strval')->all();
        $missing = array_diff($userIds, $existing);

        $rows = [];
        foreach ($missing as $uid) {
            $rows[] = [
                'id' => (string) Str::uuid(),
                'task_id' => $taskId,
                'user_id' => $uid,
                'individual_status' => 'assigned',
                'reward_paid' => false,
                'created_at' => now(),
            ];
        }
        if ($rows) DB::table('hr_task_assignees')->insert($rows);

        return count($existing) + count($rows);
    }

    /**
     * Синхронизация всех задач компании с динамической аудиторией.
     * Можно ограничить одним пользователем (?user_id=), например при изменении профиля.
     */
    public static function syncCompany(?string $companyId, ?string $onlyUserId = null): int
    {
        if (! $companyId) return 0;

        $tasks = DB::table('hr_tasks')
            ->where('company_id', $companyId)
            ->whereNotNull('audience_rules')
            ->whereIn('status', ['assigned', 'in_progress', 'pending'])
            ->get(['id', 'audience_rules']);

        $added = 0;
        foreach ($tasks as $t) {
            $rules = json_decode((string) $t->audience_rules, true);
            if (! is_array($rules) || ! $rules) continue;
            $ids = self::resolve($rules, $companyId);
            if ($onlyUserId !== null) {
                $ids = in_array((string) $onlyUserId, $ids, true) ? [(string) $onlyUserId] : [];
            }
            if (! $ids) continue;
            $before = DB::table('hr_task_assignees')->where('task_id', $t->id)->count();
            self::materialize($t->id, $ids);
            $added += max(0, DB::table('hr_task_assignees')->where('task_id', $t->id)->count() - $before);
        }

        return $added;
    }

    /** HTTP-обёртка синхронизации. */
    public function sync(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $added = self::syncCompany($this->companyId());
        return response()->json(['ok' => true, 'added' => $added]);
    }
}
