<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Записи на курсы, прогресс по урокам, выдача сертификатов.
 * Блокировка других модулей: если у пользователя есть active mandatory enrollment с blocks_other=true
 * и due_at < now() и status != completed — фронтенд показывает блокирующий баннер
 * (см. GET /university/blockers).
 */
class EnrollmentController extends Controller
{
    protected function uid(): ?string { return (string) (Auth::id() ?: '') ?: null; }

    protected function canManage(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hr','hrd','company_admin','superadmin','manager']);
    }

    /** Список моих записей (Employee — "Моё обучение"). */
    public function mine(Request $r)
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $rows = DB::table('enrollments as e')
            ->leftJoin('courses as c', 'c.id', '=', 'e.course_id')
            ->where('e.user_id', $uid)
            ->select('e.*', 'c.title as course_title', 'c.cover_url', 'c.duration_min')
            ->orderByDesc('e.updated_at')
            ->get();

        // прогресс по каждому курсу
        foreach ($rows as $row) {
            $total = DB::table('lessons as l')
                ->join('course_modules as m', 'm.id', '=', 'l.module_id')
                ->where('m.course_id', $row->course_id)->count();
            $done = DB::table('lesson_progress')
                ->where('enrollment_id', $row->id)->where('completed', true)->count();
            $row->progress_total = $total;
            $row->progress_done = $done;
            $row->progress_pct = $total > 0 ? round($done * 100 / $total) : 0;
        }

        return response()->json(['enrollments' => $rows]);
    }

    /** Записи по курсу (для HRD/менеджера). */
    public function byCourse(Request $r, string $courseId)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $rows = DB::table('enrollments as e')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'e.user_id')
            ->leftJoin('users as u', 'u.id', '=', 'e.user_id')
            ->where('e.course_id', $courseId)
            ->select('e.*', 'p.full_name', 'p.department', 'p.position', 'u.email')
            ->orderByDesc('e.updated_at')->get();
        return response()->json(['enrollments' => $rows]);
    }

    /**
     * Справочники для конструктора аудитории курса:
     * отделы, должности, грейды текущей компании.
     */
    public function audienceOptions(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = Auth::user()?->companyId();

        $departments = DB::table('profiles')->where('company_id', $companyId)
            ->whereNotNull('department')->where('department', '!=', '')
            ->distinct()->orderBy('department')->pluck('department')->values();

        $positions = DB::table('positions')->where('company_id', $companyId)
            ->orderBy('title')->get(['id', 'title']);

        $grades = DB::table('profiles')->where('company_id', $companyId)
            ->whereNotNull('grade')->where('grade', '!=', '')
            ->distinct()->orderBy('grade')->pluck('grade')->values();

        return response()->json([
            'departments' => $departments,
            'positions' => $positions,
            'grades' => $grades,
        ]);
    }

    /** Поиск сотрудников по ФИО/email для точечной привязки. */
    public function audienceSearch(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = Auth::user()?->companyId();
        $q = trim((string) $r->get('q', ''));

        $rows = DB::table('profiles as p')
            ->leftJoin('users as u', 'u.id', '=', 'p.user_id')
            ->where('p.company_id', $companyId)
            ->when($q !== '', fn ($b) => $b->where(function ($w) use ($q) {
                $w->where('p.full_name', 'like', "%{$q}%")->orWhere('u.email', 'like', "%{$q}%");
            }))
            ->orderBy('p.full_name')
            ->limit(30)
            ->get(['p.user_id', 'p.full_name', 'p.department', 'p.position', 'p.grade', 'u.email']);

        return response()->json(['users' => $rows]);
    }

    /**
     * Разрешение правил аудитории в список user_id.
     * Поддерживает: точечных пользователей, отделы, грейды, должности,
     * стаж в компании (в месяцах от hire_date) и импорт списка email.
     */
    protected function resolveAudience(array $rules, ?string $companyId): array
    {
        $userIds = [];

        $explicit = array_filter((array) ($rules['user_ids'] ?? []));
        $emails = array_filter(array_map('trim', (array) ($rules['emails'] ?? [])));

        if ($explicit) {
            $userIds = array_merge($userIds, DB::table('profiles')
                ->where('company_id', $companyId)->whereIn('user_id', $explicit)
                ->pluck('user_id')->all());
        }

        if ($emails) {
            $userIds = array_merge($userIds, DB::table('profiles as p')
                ->join('users as u', 'u.id', '=', 'p.user_id')
                ->where('p.company_id', $companyId)
                ->whereIn(DB::raw('lower(u.email)'), array_map('mb_strtolower', $emails))
                ->pluck('p.user_id')->all());
        }

        $departments = array_filter((array) ($rules['departments'] ?? []));
        $grades = array_filter((array) ($rules['grades'] ?? []));
        $positionIds = array_filter((array) ($rules['position_ids'] ?? []));
        $tenureMin = $rules['tenure_min_months'] ?? null;
        $tenureMax = $rules['tenure_max_months'] ?? null;

        $hasFilters = $departments || $grades || $positionIds
            || $tenureMin !== null || $tenureMax !== null;

        if ($hasFilters) {
            $q = DB::table('profiles')->where('company_id', $companyId);
            if ($departments) $q->whereIn('department', $departments);
            if ($grades) $q->whereIn('grade', $grades);
            if ($positionIds) $q->whereIn('position_id', $positionIds);
            if ($tenureMin !== null) {
                $q->whereNotNull('hire_date')
                  ->where('hire_date', '<=', now()->subMonths((int) $tenureMin)->toDateString());
            }
            if ($tenureMax !== null) {
                $q->whereNotNull('hire_date')
                  ->where('hire_date', '>=', now()->subMonths((int) $tenureMax)->toDateString());
            }
            $userIds = array_merge($userIds, $q->pluck('user_id')->all());
        }

        return array_values(array_unique(array_map('strval', $userIds)));
    }

    protected function audienceRules(Request $r): array
    {
        return $r->validate([
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'uuid',
            'emails' => 'nullable|array',
            'emails.*' => 'string',
            'departments' => 'nullable|array',
            'departments.*' => 'string',
            'grades' => 'nullable|array',
            'grades.*' => 'string',
            'position_ids' => 'nullable|array',
            'position_ids.*' => 'uuid',
            'tenure_min_months' => 'nullable|integer|min:0|max:600',
            'tenure_max_months' => 'nullable|integer|min:0|max:600',
            'mandatory' => 'nullable|boolean',
            'due_at' => 'nullable|date',
            'blocks_other' => 'nullable|boolean',
        ]);
    }

    /** Предпросмотр аудитории: кто попадёт под правила. */
    public function assignPreview(Request $r, string $courseId)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = Auth::user()?->companyId();
        $rules = $this->audienceRules($r);
        $ids = $this->resolveAudience($rules, $companyId);

        $already = $ids ? DB::table('enrollments')->where('course_id', $courseId)
            ->whereIn('user_id', $ids)->pluck('user_id')->all() : [];

        $preview = $ids ? DB::table('profiles as p')
            ->leftJoin('users as u', 'u.id', '=', 'p.user_id')
            ->whereIn('p.user_id', array_slice($ids, 0, 50))
            ->orderBy('p.full_name')
            ->get(['p.user_id', 'p.full_name', 'p.department', 'p.position', 'p.grade', 'u.email'])
            : collect();

        return response()->json([
            'total' => count($ids),
            'already_enrolled' => count($already),
            'to_enroll' => count($ids) - count($already),
            'sample' => $preview,
        ]);
    }

    /** Массовая привязка курса к аудитории. */
    public function bulkAssign(Request $r, string $courseId)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = Auth::user()?->companyId();

        $course = DB::table('courses')->where('id', $courseId)->first();
        if (! $course) return response()->json(['error' => 'course not found'], 404);
        if ($companyId && $course->company_id && (string) $course->company_id !== (string) $companyId) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $rules = $this->audienceRules($r);
        $ids = $this->resolveAudience($rules, $companyId);
        if (! $ids) return response()->json(['created' => 0, 'skipped' => 0, 'total' => 0]);

        $existing = DB::table('enrollments')->where('course_id', $courseId)
            ->whereIn('user_id', $ids)->pluck('user_id')->map(fn ($v) => (string) $v)->all();
        $new = array_values(array_diff($ids, $existing));

        $now = now();
        $rowsToInsert = array_map(fn ($userId) => [
            'id' => (string) Str::uuid(),
            'course_id' => $courseId,
            'user_id' => $userId,
            'assigned_by' => $this->uid(),
            'mandatory' => (bool) ($rules['mandatory'] ?? false),
            'due_at' => $rules['due_at'] ?? null,
            'blocks_other' => (bool) ($rules['blocks_other'] ?? false),
            'status' => 'not_started',
            'created_at' => $now, 'updated_at' => $now,
        ], $new);

        foreach (array_chunk($rowsToInsert, 200) as $chunk) {
            DB::table('enrollments')->insert($chunk);
        }

        // Уведомления назначенным (не критично, ошибки глушим)
        foreach ($new as $userId) {
            try {
                DB::table('notifications')->insert([
                    'id' => (string) Str::uuid(),
                    'user_id' => $userId,
                    'company_id' => $companyId,
                    'title' => 'Назначен курс',
                    'description' => (string) $course->title,
                    'notification_type' => 'course',
                    'is_read' => false,
                    'created_at' => $now,
                ]);
            } catch (\Throwable) { /* silent */ }
        }

        return response()->json([
            'created' => count($new),
            'skipped' => count($existing),
            'total' => count($ids),
        ]);
    }

    /** Отвязать сотрудника от курса. */
    public function unassign(Request $r, string $enrollmentId)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        DB::table('enrollments')->where('id', $enrollmentId)->delete();
        return response()->json(['ok' => true]);
    }


    public function enroll(Request $r)
    {
        $data = $r->validate([
            'course_id' => 'required|uuid',
            'user_id' => 'nullable|uuid',
            'mandatory' => 'nullable|boolean',
            'due_at' => 'nullable|date',
            'blocks_other' => 'nullable|boolean',
        ]);
        $uid = $data['user_id'] ?? $this->uid();
        $assignedBy = ! empty($data['user_id']) && $data['user_id'] !== $this->uid() ? $this->uid() : null;

        if ($assignedBy && ! $this->canManage()) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $exists = DB::table('enrollments')->where('course_id', $data['course_id'])->where('user_id', $uid)->first();
        if ($exists) return response()->json(['id' => $exists->id, 'reused' => true]);

        $id = (string) Str::uuid();
        DB::table('enrollments')->insert([
            'id' => $id,
            'course_id' => $data['course_id'],
            'user_id' => $uid,
            'assigned_by' => $assignedBy,
            'mandatory' => $data['mandatory'] ?? false,
            'due_at' => $data['due_at'] ?? null,
            'blocks_other' => $data['blocks_other'] ?? false,
            'status' => 'not_started',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json(['id' => $id]);
    }

    /** Записать прогресс по уроку. */
    public function progress(Request $r, string $enrollmentId)
    {
        $data = $r->validate([
            'lesson_id' => 'required|uuid',
            'completed' => 'nullable|boolean',
            'score' => 'nullable|integer|min:0|max:100',
            'last_position' => 'nullable|integer|min:0',
        ]);
        $uid = $this->uid();
        $enr = DB::table('enrollments')->where('id', $enrollmentId)->first();
        if (! $enr || $enr->user_id !== $uid) return response()->json(['error' => 'forbidden'], 403);

        $row = DB::table('lesson_progress')
            ->where('enrollment_id', $enrollmentId)->where('lesson_id', $data['lesson_id'])->first();
        $payload = [
            'completed' => $data['completed'] ?? ($row->completed ?? false),
            'score' => $data['score'] ?? ($row->score ?? null),
            'last_position' => $data['last_position'] ?? ($row->last_position ?? 0),
            'updated_at' => now(),
        ];
        if ($row) {
            DB::table('lesson_progress')->where('id', $row->id)->update(array_merge($payload, [
                'attempts' => ($row->attempts ?? 0) + (isset($data['score']) ? 1 : 0),
            ]));
        } else {
            DB::table('lesson_progress')->insert(array_merge($payload, [
                'enrollment_id' => $enrollmentId,
                'lesson_id' => $data['lesson_id'],
                'attempts' => isset($data['score']) ? 1 : 0,
                'created_at' => now(),
            ]));
        }

        // Обновляем статус enrollment
        if ($enr->status === 'not_started') {
            DB::table('enrollments')->where('id', $enrollmentId)->update([
                'status' => 'in_progress', 'started_at' => now(), 'updated_at' => now(),
            ]);
        }

        // Проверяем завершение
        $total = DB::table('lessons as l')->join('course_modules as m', 'm.id', '=', 'l.module_id')
            ->where('m.course_id', $enr->course_id)->count();
        $done = DB::table('lesson_progress')->where('enrollment_id', $enrollmentId)->where('completed', true)->count();

        $completed = $total > 0 && $done >= $total;
        $certId = null;
        if ($completed && $enr->status !== 'completed') {
            $certId = $this->issueCertificate($enr);
            DB::table('enrollments')->where('id', $enrollmentId)->update([
                'status' => 'completed',
                'completed_at' => now(),
                'certificate_id' => $certId,
                'updated_at' => now(),
            ]);
            // Авто-награда за завершение курса
            try {
                app(\App\Services\Automation\AutomationService::class)->triggerReward(
                    'course.completed',
                    (string) $enr->user_id,
                    null,
                    ['reference_id' => (string) $enr->course_id, 'description' => 'Завершение курса']
                );
            } catch (\Throwable $e) { /* silent */ }
        }


        return response()->json([
            'progress_total' => $total, 'progress_done' => $done,
            'completed' => $completed, 'certificate_id' => $certId,
        ]);
    }

    protected function issueCertificate(object $enr): string
    {
        $course = DB::table('courses')->where('id', $enr->course_id)->first();
        $profile = DB::table('profiles')->where('user_id', $enr->user_id)->first();
        $id = (string) Str::uuid();
        $serial = 'CRT-' . strtoupper(substr(str_replace('-', '', $id), 0, 12));
        DB::table('certificates')->insert([
            'id' => $id,
            'company_id' => $course?->company_id,
            'user_id' => $enr->user_id,
            'course_id' => $enr->course_id,
            'serial' => $serial,
            'user_name' => $profile?->full_name,
            'course_title' => $course?->title,
            'issued_at' => now(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }

    /** Активные блокирующие просроченные обязательные курсы для текущего пользователя. */
    public function blockers()
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['blockers' => []]);
        $rows = DB::table('enrollments as e')
            ->leftJoin('courses as c', 'c.id', '=', 'e.course_id')
            ->where('e.user_id', $uid)
            ->where('e.blocks_other', true)
            ->where('e.status', '!=', 'completed')
            ->whereNotNull('e.due_at')
            ->where('e.due_at', '<', now())
            ->select('e.id', 'e.course_id', 'e.due_at', 'c.title')
            ->get();
        return response()->json(['blockers' => $rows]);
    }

    /** Публичная страница сертификата (по серийному номеру). */
    public function certificate(string $serial)
    {
        $cert = DB::table('certificates')->where('serial', $serial)->first();
        if (! $cert) return response()->json(['error' => 'not found'], 404);
        return response()->json(['certificate' => $cert]);
    }

    /** Простая аналитика курса для HRD. */
    public function courseAnalytics(string $courseId)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $rows = DB::table('enrollments')->where('course_id', $courseId)
            ->selectRaw("count(*) as total,
                sum(case when status='completed' then 1 else 0 end) as completed,
                sum(case when status='in_progress' then 1 else 0 end) as in_progress,
                sum(case when status='not_started' then 1 else 0 end) as not_started,
                sum(case when status!='completed' and due_at is not null and due_at < now() then 1 else 0 end) as overdue")
            ->first();
        return response()->json(['stats' => $rows]);
    }
}
