<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Аналитика Корпоративного университета.
 * Только сырой SQL и агрегаты — без гидрации Eloquent (память).
 */
class UniversityAnalyticsController extends Controller
{
    protected function companyId(Request $r): ?string
    {
        $u = Auth::user();
        return (string) ($r->input('company_id') ?: $u?->companyId() ?: '') ?: null;
    }

    protected function canManage(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hr', 'hrd', 'company_admin', 'superadmin']);
    }

    /** Сводка по всем курсам компании. */
    public function overview(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $cid = $this->companyId($r);
        if (! $cid) return response()->json(['totals' => null, 'courses' => []]);

        $totals = DB::table('enrollments as e')
            ->join('courses as c', 'c.id', '=', 'e.course_id')
            ->where('c.company_id', $cid)
            ->selectRaw("count(*) as assigned,
                sum(case when e.status='completed' then 1 else 0 end) as completed,
                sum(case when e.status='in_progress' then 1 else 0 end) as in_progress,
                sum(case when e.status='not_started' then 1 else 0 end) as not_started,
                sum(case when e.status<>'completed' and e.due_at is not null and e.due_at < now() then 1 else 0 end) as overdue,
                count(distinct e.user_id) as learners")
            ->first();

        $courseTotals = DB::table('courses')->where('company_id', $cid)
            ->selectRaw("count(*) as total,
                sum(case when status='published' then 1 else 0 end) as published,
                sum(case when status='draft' then 1 else 0 end) as draft,
                sum(case when source_type='scorm' then 1 else 0 end) as scorm")
            ->first();

        $courses = DB::table('courses as c')
            ->leftJoin('enrollments as e', 'e.course_id', '=', 'c.id')
            ->where('c.company_id', $cid)
            ->groupBy('c.id', 'c.title', 'c.status', 'c.source_type', 'c.mandatory')
            ->selectRaw("c.id, c.title, c.status, c.source_type, c.mandatory,
                count(e.id) as assigned,
                sum(case when e.status='completed' then 1 else 0 end) as completed,
                sum(case when e.status='in_progress' then 1 else 0 end) as in_progress,
                sum(case when e.status<>'completed' and e.due_at is not null and e.due_at < now() then 1 else 0 end) as overdue")
            ->orderByDesc(DB::raw('count(e.id)'))
            ->limit(200)
            ->get();

        foreach ($courses as $c) {
            $c->completion_pct = $c->assigned > 0 ? (int) round($c->completed * 100 / $c->assigned) : 0;
        }

        // Топ отделов по завершаемости
        $byDept = DB::table('enrollments as e')
            ->join('courses as c', 'c.id', '=', 'e.course_id')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'e.user_id')
            ->where('c.company_id', $cid)
            ->groupBy('p.department')
            ->selectRaw("coalesce(p.department, 'Без отдела') as department,
                count(*) as assigned,
                sum(case when e.status='completed' then 1 else 0 end) as completed")
            ->orderByDesc(DB::raw('count(*)'))
            ->limit(30)
            ->get();
        foreach ($byDept as $d) {
            $d->completion_pct = $d->assigned > 0 ? (int) round($d->completed * 100 / $d->assigned) : 0;
        }

        return response()->json([
            'totals' => $totals,
            'course_totals' => $courseTotals,
            'courses' => $courses,
            'by_department' => $byDept,
        ]);
    }

    /** Детали по курсу: прогресс, сложные уроки, отстающие. */
    public function course(Request $r, string $courseId)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);

        $course = DB::table('courses')->where('id', $courseId)
            ->select('id', 'title', 'status', 'source_type', 'mandatory')->first();
        if (! $course) return response()->json(['error' => 'not found'], 404);

        $stats = DB::table('enrollments')->where('course_id', $courseId)
            ->selectRaw("count(*) as assigned,
                sum(case when status='completed' then 1 else 0 end) as completed,
                sum(case when status='in_progress' then 1 else 0 end) as in_progress,
                sum(case when status='not_started' then 1 else 0 end) as not_started,
                sum(case when status<>'completed' and due_at is not null and due_at < now() then 1 else 0 end) as overdue")
            ->first();

        $lessonsTotal = DB::table('lessons as l')
            ->join('course_modules as m', 'm.id', '=', 'l.module_id')
            ->where('m.course_id', $courseId)->count();

        // Сложность уроков: доля незавершивших, средний балл, среднее число попыток
        $lessons = DB::table('lessons as l')
            ->join('course_modules as m', 'm.id', '=', 'l.module_id')
            ->leftJoin('lesson_progress as lp', 'lp.lesson_id', '=', 'l.id')
            ->where('m.course_id', $courseId)
            ->groupBy('l.id', 'l.title', 'l.type', 'm.title', 'm.order_index', 'l.order_index')
            ->selectRaw("l.id, l.title, l.type, m.title as module_title,
                count(lp.id) as touched,
                sum(case when lp.completed = 1 or lp.completed = true then 1 else 0 end) as done,
                avg(lp.score) as avg_score,
                avg(lp.attempts) as avg_attempts")
            ->orderBy('m.order_index')->orderBy('l.order_index')
            ->get();

        foreach ($lessons as $l) {
            $l->avg_score = $l->avg_score !== null ? round((float) $l->avg_score, 1) : null;
            $l->avg_attempts = $l->avg_attempts !== null ? round((float) $l->avg_attempts, 2) : null;
            $l->pass_pct = $l->touched > 0 ? (int) round($l->done * 100 / $l->touched) : 0;
            // Индекс сложности: чем ниже прохождение и балл и выше попытки — тем выше
            $l->difficulty = (int) round(
                (100 - $l->pass_pct) * 0.6
                + (100 - (float) ($l->avg_score ?? 100)) * 0.3
                + min(100, ((float) ($l->avg_attempts ?? 1) - 1) * 40) * 0.1
            );
        }

        // Отстающие сотрудники
        $laggards = DB::table('enrollments as e')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'e.user_id')
            ->where('e.course_id', $courseId)
            ->where('e.status', '<>', 'completed')
            ->selectRaw("e.id, e.user_id, e.status, e.due_at,
                p.full_name, p.department, p.position,
                (select count(*) from lesson_progress lp where lp.enrollment_id = e.id and (lp.completed = 1 or lp.completed = true)) as done")
            ->orderBy('e.due_at')
            ->limit(200)
            ->get();

        foreach ($laggards as $u) {
            $u->progress_pct = $lessonsTotal > 0 ? (int) round($u->done * 100 / $lessonsTotal) : 0;
            $u->overdue = $u->due_at !== null && strtotime((string) $u->due_at) < time();
        }

        return response()->json([
            'course' => $course,
            'stats' => $stats,
            'lessons_total' => $lessonsTotal,
            'lessons' => $lessons,
            'laggards' => $laggards,
        ]);
    }
}
