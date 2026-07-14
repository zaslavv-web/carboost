<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Pulse-опросы: bulk-импорт вопросов + таргетинг аудитории.
 *
 * CRUD базовых сущностей идёт через DbController; здесь только операции,
 * которым нужен доменный SQL (резолв email, вычисление охвата,
 * рекурсивный обход departments).
 */
class PulseSurveyController extends Controller
{
    /** POST /pulse-surveys/{id}/questions/bulk */
    public function bulkQuestions(Request $r, string $id): JsonResponse
    {
        [$u, $survey] = $this->guard($id);
        if (!$survey) return response()->json(['error' => 'not_found'], 404);

        $data = $r->validate([
            'questions'                 => 'required|array|min:1|max:200',
            'questions.*.title'         => 'required|string|max:500',
            'questions.*.kind'          => 'required|in:scale,nps,single,multi,text',
            'questions.*.options'       => 'nullable|array',
            'questions.*.options.*'     => 'string|max:200',
            'questions.*.is_required'   => 'nullable|boolean',
        ]);

        $startIdx = (int) DB::table('pulse_survey_questions')->where('survey_id', $id)->max('order_index');
        $rows = [];
        $now = now();
        foreach ($data['questions'] as $i => $q) {
            $rows[] = [
                'id'          => (string) Str::uuid(),
                'company_id'  => $survey->company_id,
                'survey_id'   => $id,
                'order_index' => $startIdx + $i + 1,
                'kind'        => $q['kind'],
                'title'       => $q['title'],
                'options'     => !empty($q['options']) ? json_encode(array_values($q['options'])) : null,
                'is_required' => (bool) ($q['is_required'] ?? true),
                'created_at'  => $now,
                'updated_at'  => $now,
            ];
        }
        DB::table('pulse_survey_questions')->insert($rows);
        return response()->json(['imported' => count($rows)]);
    }

    /** GET /pulse-surveys/{id}/targets */
    public function listTargets(string $id): JsonResponse
    {
        [$u, $survey] = $this->guard($id);
        if (!$survey) return response()->json(['error' => 'not_found'], 404);
        $rows = DB::table('pulse_survey_targets')->where('survey_id', $id)->get();
        $invitees = DB::table('pulse_survey_invitees')->where('survey_id', $id)->get();
        return response()->json(['targets' => $rows, 'invitees' => $invitees]);
    }

    /** POST /pulse-surveys/{id}/targets  — атомарная замена */
    public function saveTargets(Request $r, string $id): JsonResponse
    {
        [$u, $survey] = $this->guard($id, requireManage: true);
        if (!$survey) return response()->json(['error' => 'not_found'], 404);

        $data = $r->validate([
            'targets'          => 'array',
            'targets.*.type'   => 'required_with:targets|in:department,subdivision,position,user',
            'targets.*.ref'    => 'required_with:targets|uuid',
        ]);

        DB::transaction(function () use ($id, $survey, $data) {
            DB::table('pulse_survey_targets')->where('survey_id', $id)->delete();
            $now = now();
            $rows = [];
            foreach (($data['targets'] ?? []) as $t) {
                $rows[] = [
                    'id'          => (string) Str::uuid(),
                    'company_id'  => $survey->company_id,
                    'survey_id'   => $id,
                    'target_type' => $t['type'],
                    'target_ref'  => $t['ref'],
                    'created_at'  => $now,
                    'updated_at'  => $now,
                ];
            }
            if ($rows) DB::table('pulse_survey_targets')->insert($rows);
        });

        return response()->json(['ok' => true, 'count' => count($data['targets'] ?? [])]);
    }

    /** POST /pulse-surveys/{id}/roster/resolve  — резолв списка email в user_id */
    public function resolveRoster(Request $r, string $id): JsonResponse
    {
        [$u, $survey] = $this->guard($id, requireManage: true);
        if (!$survey) return response()->json(['error' => 'not_found'], 404);

        $data = $r->validate([
            'emails'   => 'required|array|min:1|max:500',
            'emails.*' => 'string|email|max:255',
        ]);
        $emails = array_values(array_unique(array_map(fn($e) => strtolower(trim($e)), $data['emails'])));

        $found = DB::table('users as usr')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'usr.id')
            ->whereIn(DB::raw('LOWER(usr.email)'), $emails)
            ->where(function ($q) use ($survey) {
                $q->where('p.company_id', $survey->company_id)
                  ->orWhereNull('p.company_id'); // невезифицированные, но с email — тоже помогают
            })
            ->select('usr.id as user_id', 'usr.email', 'p.full_name', 'p.company_id')
            ->get();

        $foundEmails = $found->pluck('email')->map(fn($e) => strtolower($e))->all();
        $notFound = array_values(array_diff($emails, $foundEmails));

        return response()->json([
            'found'     => $found->map(fn($x) => [
                'email'     => $x->email,
                'user_id'   => $x->user_id,
                'full_name' => $x->full_name,
                'in_company' => (string) $x->company_id === (string) $survey->company_id,
            ]),
            'not_found' => $notFound,
        ]);
    }

    /** POST /pulse-surveys/{id}/roster/commit  — добавляет user-таргеты + внешние email в invitees */
    public function commitRoster(Request $r, string $id): JsonResponse
    {
        [$u, $survey] = $this->guard($id, requireManage: true);
        if (!$survey) return response()->json(['error' => 'not_found'], 404);

        $data = $r->validate([
            'user_ids'          => 'array',
            'user_ids.*'        => 'uuid',
            'external_emails'   => 'array',
            'external_emails.*' => 'string|email|max:255',
        ]);

        $now = now();

        // 1) user-таргеты
        $rows = [];
        foreach (($data['user_ids'] ?? []) as $uid) {
            $rows[] = [
                'id'          => (string) Str::uuid(),
                'company_id'  => $survey->company_id,
                'survey_id'   => $id,
                'target_type' => 'user',
                'target_ref'  => $uid,
                'created_at'  => $now,
                'updated_at'  => $now,
            ];
        }
        if ($rows) {
            DB::table('pulse_survey_targets')->insertOrIgnore($rows);
        }

        // 2) внешние email
        $invRows = [];
        foreach (($data['external_emails'] ?? []) as $email) {
            $invRows[] = [
                'id'         => (string) Str::uuid(),
                'company_id' => $survey->company_id,
                'survey_id'  => $id,
                'email'      => strtolower(trim($email)),
                'status'     => 'pending',
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        if ($invRows) {
            DB::table('pulse_survey_invitees')->insertOrIgnore($invRows);
        }

        return response()->json(['ok' => true, 'added_users' => count($rows), 'added_invitees' => count($invRows)]);
    }

    /** GET /pulse-surveys/{id}/audience  — вычисленный охват */
    public function audience(string $id): JsonResponse
    {
        [$u, $survey] = $this->guard($id);
        if (!$survey) return response()->json(['error' => 'not_found'], 404);

        $targets = DB::table('pulse_survey_targets')->where('survey_id', $id)->get();
        $companyId = $survey->company_id;
        $userIds = [];

        // Собираем имена департаментов для subdivision-охвата
        $subdivisionRefs = $targets->where('target_type', 'subdivision')->pluck('target_ref')->all();
        $departmentRefs  = $targets->where('target_type', 'department')->pluck('target_ref')->all();
        $positionRefs    = $targets->where('target_type', 'position')->pluck('target_ref')->all();
        $userRefs        = $targets->where('target_type', 'user')->pluck('target_ref')->all();

        // Departments: id -> name
        $deptRows = DB::table('departments')->where('company_id', $companyId)->select('id', 'name', 'parent_id')->get();
        $deptById = $deptRows->keyBy('id');

        // Собираем имена для subdivision (root + all descendants)
        $subdivisionNames = [];
        foreach ($subdivisionRefs as $rootId) {
            $stack = [$rootId];
            while ($stack) {
                $curr = array_pop($stack);
                if (!isset($deptById[$curr])) continue;
                $subdivisionNames[] = $deptById[$curr]->name;
                foreach ($deptRows->where('parent_id', $curr) as $child) {
                    $stack[] = $child->id;
                }
            }
        }

        // Имена для конкретных department (без потомков)
        $departmentNames = [];
        foreach ($departmentRefs as $did) {
            if (isset($deptById[$did])) $departmentNames[] = $deptById[$did]->name;
        }

        $allDeptNames = array_values(array_unique(array_merge($subdivisionNames, $departmentNames)));

        // Профили из компании
        $q = DB::table('profiles')->where('company_id', $companyId);
        $q->where(function ($qq) use ($allDeptNames, $positionRefs, $userRefs) {
            if ($allDeptNames) $qq->orWhereIn('department', $allDeptNames);
            if ($positionRefs) $qq->orWhereIn('position_id', $positionRefs);
            if ($userRefs) $qq->orWhereIn('user_id', $userRefs);
            // если пусто — вернём нулевое множество
            if (!$allDeptNames && !$positionRefs && !$userRefs) $qq->whereRaw('1=0');
        });
        $rows = $q->select('user_id', 'full_name', 'department', 'position_id')->get();
        $userIds = $rows->pluck('user_id')->unique()->values()->all();

        return response()->json([
            'count'  => count($userIds),
            'users'  => $rows->unique('user_id')->values(),
        ]);
    }

    // ------ helpers ------

    /** @return array{0: ?object, 1: ?object} [user, survey] */
    private function guard(string $surveyId, bool $requireManage = false): array
    {
        $u = Auth::user();
        abort_unless($u && $u->company_id, 401);
        $survey = DB::table('pulse_surveys')->where('id', $surveyId)->first();
        if (!$survey || (string) $survey->company_id !== (string) $u->company_id) {
            return [$u, null];
        }
        if ($requireManage && !$this->canManage($u)) {
            abort(403, 'forbidden');
        }
        return [$u, $survey];
    }

    private function canManage($u): bool
    {
        if (!$u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hrd', 'company_admin', 'superadmin']);
    }
}
