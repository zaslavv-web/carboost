<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Детализация и аналитика карьерных треков для HR/HRD/руководителей.
 *
 * Все выборки идут через raw-query builder с явными полями: generic CRUD
 * тянет JSON-колонки шаблонов целиком и упирается в лимит памяти.
 */
class CareerTrackInsightController extends Controller
{
    /** Роли, которым доступна аналитика по компании. */
    private const HR_ROLES = ['hr', 'hrd', 'company_admin', 'superadmin'];

    private function roles(): array
    {
        $u = Auth::user();
        if (! $u) return [];
        return DB::table('user_roles')->where('user_id', $u->getAuthIdentifier())->pluck('role')->all();
    }

    private function companyId(): ?string
    {
        $u = Auth::user();
        if (! $u) return null;
        return DB::table('profiles')->where('user_id', $u->getAuthIdentifier())->value('company_id');
    }

    private function isSuperadmin(): bool
    {
        return in_array('superadmin', $this->roles(), true);
    }

    private function canReadCompany(): bool
    {
        return (bool) array_intersect($this->roles(), self::HR_ROLES);
    }

    /**
     * Доступ к треку конкретного сотрудника:
     * сам сотрудник, HR-роли своей компании, руководитель своей команды.
     */
    private function canReadEmployee(string $userId, ?string $employeeCompanyId): bool
    {
        $me = Auth::user();
        if (! $me) return false;
        $myId = (string) $me->getAuthIdentifier();
        if ($myId === $userId) return true;
        if ($this->isSuperadmin()) return true;

        $myCompany = $this->companyId();
        if (! $myCompany || $myCompany !== $employeeCompanyId) return false;

        if ($this->canReadCompany()) return true;

        if (in_array('manager', $this->roles(), true)) {
            return DB::table('team_members')
                ->where('manager_id', $myId)
                ->where('employee_id', $userId)
                ->exists();
        }

        return false;
    }

    private function decodeJson($value, $fallback = [])
    {
        if (is_array($value)) return $value;
        if (! is_string($value) || $value === '') return $fallback;
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : $fallback;
    }

    /** GET /career-tracks/employee/{userId} — треки, этапы и тесты сотрудника. */
    public function employee(Request $request, string $userId): JsonResponse
    {
        $profile = DB::table('profiles')->where('user_id', $userId)
            ->first(['user_id', 'full_name', 'position', 'department', 'avatar_url', 'company_id', 'position_id']);

        if (! $profile) {
            return response()->json(['message' => 'Сотрудник не найден'], 404);
        }
        if (! $this->canReadEmployee($userId, $profile->company_id)) {
            return response()->json(['message' => 'Недостаточно прав'], 403);
        }

        $assignments = DB::table('employee_career_assignments')
            ->where('user_id', $userId)
            ->orderByDesc('assigned_at')
            ->limit(50)
            ->get(['id', 'template_id', 'current_step', 'status', 'personal_motivation', 'assigned_at', 'updated_at']);

        $templateIds = $assignments->pluck('template_id')->filter()->unique()->values()->all();
        $templates = $templateIds
            ? DB::table('career_track_templates')->whereIn('id', $templateIds)
                ->get(['id', 'title', 'description', 'estimated_months', 'steps', 'from_position_id', 'to_position_id'])
            : collect();

        $positionIds = $templates->pluck('from_position_id')
            ->merge($templates->pluck('to_position_id'))
            ->filter()->unique()->values()->all();
        $positionTitles = $positionIds
            ? DB::table('positions')->whereIn('id', $positionIds)->pluck('title', 'id')
            : collect();

        $assignmentIds = $assignments->pluck('id')->all();
        $submissions = $assignmentIds
            ? DB::table('career_step_submissions')->whereIn('assignment_id', $assignmentIds)
                ->orderBy('step_order')->orderBy('created_at')
                ->limit(500)
                ->get([
                    'id', 'assignment_id', 'template_id', 'step_order', 'attempt_no', 'is_reinforced',
                    'comment', 'status', 'reviewed_by', 'reviewed_at', 'rejection_reason',
                    'test_attempt_id', 'created_at',
                ])
            : collect();

        $submissionIds = $submissions->pluck('id')->all();
        $files = $submissionIds
            ? DB::table('career_step_submission_files')->whereIn('submission_id', $submissionIds)
                ->get(['id', 'submission_id', 'file_url', 'file_name', 'file_size', 'uploaded_at'])
            : collect();

        $reviewerIds = $submissions->pluck('reviewed_by')->filter()->unique()->values()->all();
        $reviewerNames = $reviewerIds
            ? DB::table('profiles')->whereIn('user_id', $reviewerIds)->pluck('full_name', 'user_id')
            : collect();

        // Все попытки тестов сотрудника (не только привязанные к сабмишенам).
        $attempts = DB::table('test_attempts')
            ->where('user_id', $userId)
            ->orderByDesc('created_at')
            ->limit(200)
            ->get(['id', 'test_id', 'test_source', 'score', 'total', 'created_at']);

        $testIds = $attempts->pluck('test_id')->filter()->unique()->values()->all();
        $testTitles = $testIds
            ? DB::table('closed_question_tests')->whereIn('id', $testIds)->pluck('title', 'id')
            : collect();

        // Сценарии шагов: требования по тестам и минимальный балл.
        $scenarios = $templateIds
            ? DB::table('career_step_scenarios')->whereIn('template_id', $templateIds)
                ->get(['template_id', 'step_order', 'requires_test', 'test_id', 'min_test_score', 'requires_files', 'min_files', 'requires_comment', 'instructions'])
            : collect();

        $attemptToStep = [];
        foreach ($submissions as $s) {
            if ($s->test_attempt_id) {
                $attemptToStep[$s->test_attempt_id] = [
                    'assignment_id' => $s->assignment_id,
                    'step_order' => (int) $s->step_order,
                ];
            }
        }

        $tracks = [];
        foreach ($assignments as $a) {
            $tpl = $templates->firstWhere('id', $a->template_id);
            $steps = $tpl ? $this->decodeJson($tpl->steps) : [];
            $tplScenarios = $scenarios->where('template_id', $a->template_id)->keyBy('step_order');
            $tplSubs = $submissions->where('assignment_id', $a->id)->values();

            $stepRows = [];
            foreach (array_values($steps) as $i => $step) {
                $order = (int) ($step['order'] ?? $i);
                $stepSubs = $tplSubs->where('step_order', $order)->values();
                $last = $stepSubs->last();
                $state = 'upcoming';
                if ((int) $a->current_step > $order || $a->status === 'completed') {
                    $state = 'passed';
                } elseif ((int) $a->current_step === $order) {
                    $state = 'current';
                }
                if ($last && $last->status === 'rejected' && $state !== 'passed') {
                    $state = 'rejected';
                }
                if ($last && $last->status === 'pending' && $state !== 'passed') {
                    $state = 'pending_review';
                }

                $scenario = $tplScenarios->get($order);
                $stepRows[] = [
                    'order' => $order,
                    'title' => $step['title'] ?? ('Этап ' . ($order + 1)),
                    'description' => $step['description'] ?? null,
                    'duration_months' => $step['duration_months'] ?? null,
                    'goals' => $step['goals'] ?? [],
                    'pass_conditions' => $step['pass_conditions'] ?? [],
                    'state' => $state,
                    'attempts' => $stepSubs->count(),
                    'requires_test' => $scenario ? (bool) $scenario->requires_test : false,
                    'min_test_score' => $scenario ? (int) $scenario->min_test_score : 0,
                    'submissions' => $stepSubs->map(fn ($s) => [
                        'id' => $s->id,
                        'attempt_no' => (int) $s->attempt_no,
                        'is_reinforced' => (bool) $s->is_reinforced,
                        'status' => $s->status,
                        'comment' => $s->comment,
                        'rejection_reason' => $s->rejection_reason,
                        'reviewed_at' => $s->reviewed_at,
                        'reviewer_name' => $s->reviewed_by ? ($reviewerNames[$s->reviewed_by] ?? null) : null,
                        'test_attempt_id' => $s->test_attempt_id,
                        'created_at' => $s->created_at,
                        'files' => $files->where('submission_id', $s->id)->map(fn ($f) => [
                            'id' => $f->id,
                            'file_url' => $f->file_url,
                            'file_name' => $f->file_name,
                            'file_size' => $f->file_size,
                        ])->values(),
                    ])->values(),
                ];
            }

            $totalSteps = max(count($stepRows), 1);
            $doneSteps = $a->status === 'completed' ? $totalSteps : min((int) $a->current_step, $totalSteps);

            $tracks[] = [
                'assignment_id' => $a->id,
                'template_id' => $a->template_id,
                'title' => $tpl->title ?? 'Трек',
                'description' => $tpl->description ?? null,
                'estimated_months' => $tpl->estimated_months ?? null,
                'from_position' => $tpl && $tpl->from_position_id ? ($positionTitles[$tpl->from_position_id] ?? null) : null,
                'to_position' => $tpl && $tpl->to_position_id ? ($positionTitles[$tpl->to_position_id] ?? null) : null,
                'status' => $a->status,
                'current_step' => (int) $a->current_step,
                'total_steps' => $totalSteps,
                'progress' => (int) round($doneSteps / $totalSteps * 100),
                'personal_motivation' => $a->personal_motivation,
                'assigned_at' => $a->assigned_at,
                'updated_at' => $a->updated_at,
                'steps' => $stepRows,
            ];
        }

        $testRows = $attempts->map(function ($t) use ($testTitles, $attemptToStep, $tracks) {
            $link = $attemptToStep[$t->id] ?? null;
            $trackTitle = null;
            if ($link) {
                foreach ($tracks as $tr) {
                    if ($tr['assignment_id'] === $link['assignment_id']) { $trackTitle = $tr['title']; break; }
                }
            }
            $total = (int) $t->total;
            return [
                'id' => $t->id,
                'title' => $t->test_id ? ($testTitles[$t->test_id] ?? 'Тест') : 'Тест',
                'source' => $t->test_source,
                'score' => (int) $t->score,
                'total' => $total,
                'percent' => $total > 0 ? (int) round($t->score / $total * 100) : 0,
                'step_order' => $link['step_order'] ?? null,
                'track_title' => $trackTitle,
                'created_at' => $t->created_at,
            ];
        })->values();

        return response()->json([
            'employee' => $profile,
            'tracks' => $tracks,
            'tests' => $testRows,
        ]);
    }

    /** GET /career-tracks/attempt/{id} — разбор попытки теста. */
    public function attempt(Request $request, string $id): JsonResponse
    {
        $attempt = DB::table('test_attempts')->where('id', $id)
            ->first(['id', 'user_id', 'company_id', 'test_id', 'score', 'total', 'answers', 'competency_breakdown', 'created_at']);
        if (! $attempt) {
            return response()->json(['message' => 'Попытка не найдена'], 404);
        }

        $employeeCompany = $attempt->company_id
            ?: DB::table('profiles')->where('user_id', $attempt->user_id)->value('company_id');
        if (! $this->canReadEmployee((string) $attempt->user_id, $employeeCompany)) {
            return response()->json(['message' => 'Недостаточно прав'], 403);
        }

        $test = $attempt->test_id
            ? DB::table('closed_question_tests')->where('id', $attempt->test_id)->first(['id', 'title', 'questions'])
            : null;

        $questions = $test ? $this->decodeJson($test->questions) : [];
        $answers = $this->decodeJson($attempt->answers);

        $rows = [];
        foreach (array_values($questions) as $i => $q) {
            $given = $answers[$i] ?? ($answers[(string) $i] ?? null);
            if (is_array($given) && array_key_exists('answer', $given)) {
                $given = $given['answer'];
            }
            $correct = $q['correct'] ?? $q['correct_index'] ?? $q['answer'] ?? null;
            $rows[] = [
                'index' => $i,
                'question' => $q['question'] ?? $q['text'] ?? ('Вопрос ' . ($i + 1)),
                'options' => $q['options'] ?? [],
                'competency' => $q['competency'] ?? null,
                'given' => $given,
                'correct' => $correct,
                'is_correct' => $correct !== null && (string) $given === (string) $correct,
            ];
        }

        return response()->json([
            'attempt' => [
                'id' => $attempt->id,
                'title' => $test->title ?? 'Тест',
                'score' => (int) $attempt->score,
                'total' => (int) $attempt->total,
                'created_at' => $attempt->created_at,
                'competency_breakdown' => $this->decodeJson($attempt->competency_breakdown),
            ],
            'questions' => $rows,
        ]);
    }

    /** GET /analytics/career-tracks — агрегаты по трекам компании. */
    public function analytics(Request $request): JsonResponse
    {
        if (! $this->canReadCompany() && ! in_array('manager', $this->roles(), true)) {
            return response()->json(['message' => 'Недостаточно прав'], 403);
        }
        $companyId = $this->companyId();
        if (! $companyId && ! $this->isSuperadmin()) {
            return response()->json(['message' => 'Не указана компания'], 403);
        }
        if ($this->isSuperadmin() && $request->query('company_id')) {
            $companyId = (string) $request->query('company_id');
        }

        $templates = DB::table('career_track_templates')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->get(['id', 'title', 'steps', 'estimated_months']);
        $templateIds = $templates->pluck('id')->all();

        if (! $templateIds) {
            return response()->json(['tracks' => [], 'hard_steps' => [], 'departments' => [], 'pace' => ['fast' => [], 'slow' => []]]);
        }

        $assignments = DB::table('employee_career_assignments')
            ->whereIn('template_id', $templateIds)
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->get(['id', 'user_id', 'template_id', 'current_step', 'status', 'assigned_at', 'updated_at']);

        $userIds = $assignments->pluck('user_id')->unique()->values()->all();
        $profiles = $userIds
            ? DB::table('profiles')->whereIn('user_id', $userIds)->get(['user_id', 'full_name', 'department', 'position'])
            : collect();
        $profileById = $profiles->keyBy('user_id');

        $assignmentIds = $assignments->pluck('id')->all();
        $subs = $assignmentIds
            ? DB::table('career_step_submissions')->whereIn('assignment_id', $assignmentIds)
                ->get(['assignment_id', 'template_id', 'step_order', 'status', 'attempt_no', 'created_at', 'reviewed_at'])
            : collect();

        $stepTitles = [];
        $stepCount = [];
        foreach ($templates as $tpl) {
            $steps = $this->decodeJson($tpl->steps);
            $stepCount[$tpl->id] = max(count($steps), 1);
            foreach (array_values($steps) as $i => $s) {
                $stepTitles[$tpl->id . ':' . $i] = $s['title'] ?? ('Этап ' . ($i + 1));
            }
        }

        // --- Воронка по трекам ---
        $tracks = [];
        foreach ($templates as $tpl) {
            $tAsg = $assignments->where('template_id', $tpl->id)->values();
            if ($tAsg->isEmpty()) continue;
            $total = $stepCount[$tpl->id];
            $funnel = [];
            for ($i = 0; $i <= $total; $i++) {
                $reached = $tAsg->filter(fn ($a) => $a->status === 'completed' || (int) $a->current_step >= $i)->count();
                $funnel[] = [
                    'step' => $i,
                    'label' => $i === $total ? 'Завершён' : ($stepTitles[$tpl->id . ':' . $i] ?? ('Этап ' . ($i + 1))),
                    'reached' => $reached,
                    'share' => (int) round($reached / max($tAsg->count(), 1) * 100),
                ];
            }
            $completed = $tAsg->where('status', 'completed')->count();
            $tracks[] = [
                'id' => $tpl->id,
                'title' => $tpl->title,
                'assigned' => $tAsg->count(),
                'completed' => $completed,
                'completion_rate' => (int) round($completed / max($tAsg->count(), 1) * 100),
                'total_steps' => $total,
                'avg_progress' => (int) round($tAsg->avg(fn ($a) => min(100, ($a->status === 'completed' ? $total : (int) $a->current_step) / $total * 100))),
                'funnel' => $funnel,
            ];
        }

        // --- Сложные этапы ---
        $hardSteps = [];
        $grouped = $subs->groupBy(fn ($s) => $s->template_id . ':' . (int) $s->step_order);
        foreach ($grouped as $key => $rows) {
            [$tplId, $order] = explode(':', $key);
            $rejected = $rows->where('status', 'rejected')->count();
            $count = $rows->count();
            $avgAttempts = round($rows->avg(fn ($r) => (int) $r->attempt_no), 2);
            $stuck = $assignments->where('template_id', $tplId)
                ->filter(fn ($a) => (int) $a->current_step === (int) $order && $a->status !== 'completed')->count();
            $difficulty = (int) round(
                ($count > 0 ? $rejected / $count * 100 : 0) * 0.6 + min(100, ($avgAttempts - 1) * 50) * 0.4,
            );
            $hardSteps[] = [
                'template_id' => $tplId,
                'track_title' => $templates->firstWhere('id', $tplId)->title ?? '',
                'step_order' => (int) $order,
                'step_title' => $stepTitles[$key] ?? ('Этап ' . ((int) $order + 1)),
                'submissions' => $count,
                'rejected' => $rejected,
                'rejection_rate' => $count > 0 ? (int) round($rejected / $count * 100) : 0,
                'avg_attempts' => $avgAttempts,
                'stuck_now' => $stuck,
                'difficulty' => $difficulty,
            ];
        }
        usort($hardSteps, fn ($a, $b) => $b['difficulty'] <=> $a['difficulty']);
        $hardSteps = array_slice($hardSteps, 0, 15);

        // --- Отделы ---
        $byDept = [];
        foreach ($assignments as $a) {
            $dept = $profileById[$a->user_id]->department ?? '—';
            $total = $stepCount[$a->template_id] ?? 1;
            $progress = min(100, ($a->status === 'completed' ? $total : (int) $a->current_step) / $total * 100);
            $byDept[$dept]['progress'][] = $progress;
            $byDept[$dept]['completed'] = ($byDept[$dept]['completed'] ?? 0) + ($a->status === 'completed' ? 1 : 0);
            $byDept[$dept]['count'] = ($byDept[$dept]['count'] ?? 0) + 1;
        }
        $subsByAssignment = $subs->groupBy('assignment_id');
        $rejectedByDept = [];
        foreach ($assignments as $a) {
            $dept = $profileById[$a->user_id]->department ?? '—';
            $rows = $subsByAssignment[$a->id] ?? collect();
            $rejectedByDept[$dept]['rejected'] = ($rejectedByDept[$dept]['rejected'] ?? 0) + $rows->where('status', 'rejected')->count();
            $rejectedByDept[$dept]['total'] = ($rejectedByDept[$dept]['total'] ?? 0) + $rows->count();
        }
        $departments = [];
        foreach ($byDept as $dept => $d) {
            $rejTotal = $rejectedByDept[$dept]['total'] ?? 0;
            $rejRate = $rejTotal > 0 ? (int) round(($rejectedByDept[$dept]['rejected'] ?? 0) / $rejTotal * 100) : 0;
            $avgProgress = (int) round(array_sum($d['progress']) / max(count($d['progress']), 1));
            $departments[] = [
                'department' => $dept,
                'employees' => $d['count'],
                'avg_progress' => $avgProgress,
                'completion_rate' => (int) round(($d['completed'] ?? 0) / max($d['count'], 1) * 100),
                'rejection_rate' => $rejRate,
                'difficulty' => (int) round((100 - $avgProgress) * 0.6 + $rejRate * 0.4),
            ];
        }
        usort($departments, fn ($a, $b) => $b['difficulty'] <=> $a['difficulty']);

        // --- Темп сотрудников ---
        $paceRows = [];
        $now = time();
        foreach ($assignments as $a) {
            $total = $stepCount[$a->template_id] ?? 1;
            $startTs = $a->assigned_at ? strtotime((string) $a->assigned_at) : null;
            if (! $startTs) continue;
            $months = max(0.5, ($now - $startTs) / (30 * 86400));
            $done = $a->status === 'completed' ? $total : (int) $a->current_step;
            $paceRows[] = [
                'user_id' => $a->user_id,
                'full_name' => $profileById[$a->user_id]->full_name ?? '—',
                'department' => $profileById[$a->user_id]->department ?? '—',
                'track_title' => $templates->firstWhere('id', $a->template_id)->title ?? '',
                'steps_done' => $done,
                'total_steps' => $total,
                'months' => round($months, 1),
                'pace' => round($done / $months, 2),
                'status' => $a->status,
            ];
        }
        $paces = array_map(fn ($r) => $r['pace'], $paceRows);
        sort($paces);
        $median = $paces ? (float) $paces[intdiv(count($paces), 2)] : 0.0;
        foreach ($paceRows as &$r) {
            $r['median_pace'] = round($median, 2);
            $r['delta_percent'] = $median > 0 ? (int) round(($r['pace'] - $median) / $median * 100) : 0;
        }
        unset($r);
        usort($paceRows, fn ($a, $b) => $b['pace'] <=> $a['pace']);
        $fast = array_slice($paceRows, 0, 10);
        $slow = array_slice(array_reverse($paceRows), 0, 10);

        return response()->json([
            'tracks' => $tracks,
            'hard_steps' => $hardSteps,
            'departments' => $departments,
            'pace' => ['fast' => $fast, 'slow' => $slow, 'median' => round($median, 2)],
        ]);
    }
}
