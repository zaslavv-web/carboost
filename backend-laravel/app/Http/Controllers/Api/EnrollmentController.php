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
        return (bool) array_intersect($roles, ['hrd','company_admin','superadmin','manager']);
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
            ->leftJoin('profiles as p', 'p.id', '=', 'e.user_id')
            ->where('e.course_id', $courseId)
            ->select('e.*', 'p.full_name', 'p.email')
            ->orderByDesc('e.updated_at')->get();
        return response()->json(['enrollments' => $rows]);
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
        $profile = DB::table('profiles')->where('id', $enr->user_id)->first();
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
