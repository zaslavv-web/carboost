<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Похожие сотрудники + бизнес-окружение пользователя.
 *
 * GET /api/profiles/{userId}/similar?scope=company|global&limit=10
 * GET /api/profiles/{userId}/environment
 *
 * Доступ:
 *   - сам пользователь
 *   - его менеджер (team_members.manager_id)
 *   - HRD / company_admin своей компании
 *   - superadmin
 * Глобальный scope — только superadmin/HRD/company_admin.
 */
class UserInsightsController extends Controller
{
    public function similar(Request $request, string $userId): JsonResponse
    {
        $target = $this->loadTarget($userId);
        $this->authorizeAccess($target);

        $scope = $request->get('scope', 'company');
        $limit = max(1, min(20, (int) $request->get('limit', 10)));

        $actor = auth()->user();
        $isSuper = $actor && method_exists($actor, 'hasRole') && $actor->hasRole('superadmin');
        $isHrd = $actor && method_exists($actor, 'hasRole')
            && ($actor->hasRole('hrd') || $actor->hasRole('company_admin'));
        if ($scope === 'global' && !($isSuper || $isHrd)) {
            abort(403, 'Нет прав на глобальный поиск похожих сотрудников');
        }

        $q = DB::table('profiles as p')
            ->leftJoin('users as u', 'u.id', '=', 'p.user_id')
            ->leftJoin('companies as c', 'c.id', '=', 'p.company_id')
            ->select(
                'p.user_id', 'p.full_name', 'p.avatar_url', 'p.position',
                'p.department', 'p.position_id', 'p.company_id',
                'u.email', 'c.name as company_name'
            )
            ->where('p.user_id', '<>', $target->user_id);

        if ($scope === 'company') {
            $q->where('p.company_id', $target->company_id);
        }

        $candidates = $q->limit(500)->get();

        // активное назначение трека целевого пользователя
        $targetTemplateId = DB::table('employee_career_assignments')
            ->where('user_id', $target->user_id)
            ->where('status', 'active')
            ->value('template_id');

        // карта активных назначений по кандидатам (один запрос)
        $candidateIds = $candidates->pluck('user_id')->all();
        $candAssigns = DB::table('employee_career_assignments')
            ->whereIn('user_id', $candidateIds)
            ->where('status', 'active')
            ->pluck('template_id', 'user_id');

        // skills таргета
        $targetSkills = DB::table('competencies')
            ->where('user_id', $target->user_id)
            ->select('skill_name', 'skill_value')
            ->get()
            ->keyBy(fn ($r) => strtolower((string) $r->skill_name))
            ->map(fn ($r) => (int) $r->skill_value);

        // skills кандидатов
        $candSkillsRaw = DB::table('competencies')
            ->whereIn('user_id', $candidateIds)
            ->select('user_id', 'skill_name', 'skill_value')
            ->get();
        $candSkills = [];
        foreach ($candSkillsRaw as $row) {
            $candSkills[$row->user_id][strtolower((string) $row->skill_name)] = (int) $row->skill_value;
        }

        $targetMag = 0.0;
        foreach ($targetSkills as $v) {
            $targetMag += $v * $v;
        }
        $targetMag = sqrt($targetMag);

        $result = [];
        foreach ($candidates as $c) {
            $score = 0;
            $reasons = [];

            if ($target->position_id && $c->position_id === $target->position_id) {
                $score += 40; $reasons[] = 'same_position';
            }
            if ($target->department && trim((string) $c->department) === trim((string) $target->department)) {
                $score += 20; $reasons[] = 'same_department';
            }
            if ($targetTemplateId && ($candAssigns[$c->user_id] ?? null) === $targetTemplateId) {
                $score += 20; $reasons[] = 'same_track';
            }

            $cosine = 0.0;
            $sharedSkills = 0;
            $candS = $candSkills[$c->user_id] ?? [];
            if ($targetMag > 0 && !empty($candS)) {
                $dot = 0.0; $mag = 0.0;
                foreach ($candS as $name => $v) {
                    $mag += $v * $v;
                    if (isset($targetSkills[$name])) {
                        $dot += $targetSkills[$name] * $v;
                        $sharedSkills++;
                    }
                }
                $mag = sqrt($mag);
                if ($mag > 0) {
                    $cosine = $dot / ($targetMag * $mag);
                }
            }
            $score += (int) round(20 * $cosine);
            if ($sharedSkills > 0) {
                $reasons[] = 'shared_skills_' . $sharedSkills;
            }

            if ($score <= 0) continue;

            $result[] = [
                'user_id'         => $c->user_id,
                'full_name'       => $c->full_name,
                'avatar_url'      => $c->avatar_url,
                'position'        => $c->position,
                'department'      => $c->department,
                'company_id'      => $c->company_id,
                'company_name'    => $c->company_name,
                'email'           => $c->email,
                'similarity'      => $score,
                'shared_skills'   => $sharedSkills,
                'reasons'         => $reasons,
            ];
        }

        usort($result, fn ($a, $b) => $b['similarity'] <=> $a['similarity']);
        $result = array_slice($result, 0, $limit);

        return response()->json([
            'scope'   => $scope,
            'target'  => [
                'user_id' => $target->user_id,
                'full_name' => $target->full_name,
            ],
            'similar' => $result,
        ]);
    }

    public function environment(Request $request, string $userId): JsonResponse
    {
        $target = $this->loadTarget($userId);
        $this->authorizeAccess($target);

        // менеджер
        $manager = null;
        $managerRow = DB::table('team_members as tm')
            ->where('tm.employee_id', $target->user_id)
            ->leftJoin('profiles as p', 'p.user_id', '=', 'tm.manager_id')
            ->leftJoin('users as u', 'u.id', '=', 'tm.manager_id')
            ->select('p.user_id', 'p.full_name', 'p.avatar_url', 'p.position', 'p.department', 'u.email')
            ->first();
        if ($managerRow) $manager = (array) $managerRow;

        // подчинённые
        $directReports = DB::table('team_members as tm')
            ->where('tm.manager_id', $target->user_id)
            ->leftJoin('profiles as p', 'p.user_id', '=', 'tm.employee_id')
            ->leftJoin('users as u', 'u.id', '=', 'tm.employee_id')
            ->select('p.user_id', 'p.full_name', 'p.avatar_url', 'p.position', 'p.department', 'u.email')
            ->limit(50)->get();

        // глава отдела
        $departmentHead = null;
        if ($target->department) {
            $headRow = DB::table('departments as d')
                ->where('d.company_id', $target->company_id)
                ->where('d.name', $target->department)
                ->whereNotNull('d.head_user_id')
                ->leftJoin('profiles as p', 'p.user_id', '=', 'd.head_user_id')
                ->leftJoin('users as u', 'u.id', '=', 'd.head_user_id')
                ->select('p.user_id', 'p.full_name', 'p.avatar_url', 'p.position', 'u.email')
                ->first();
            if ($headRow) $departmentHead = (array) $headRow;
        }

        // коллеги (та же должность или отдел, кроме самого юзера/менеджера/подчинённых)
        $exclude = collect([$target->user_id, $manager['user_id'] ?? null])
            ->merge($directReports->pluck('user_id'))
            ->filter()->unique()->all();
        $peersQ = DB::table('profiles as p')
            ->leftJoin('users as u', 'u.id', '=', 'p.user_id')
            ->where('p.company_id', $target->company_id)
            ->whereNotIn('p.user_id', $exclude)
            ->where(function ($q) use ($target) {
                if ($target->position_id) $q->orWhere('p.position_id', $target->position_id);
                if ($target->department)  $q->orWhere('p.department', $target->department);
            })
            ->select('p.user_id', 'p.full_name', 'p.avatar_url', 'p.position', 'p.department', 'u.email')
            ->limit(6);
        $peers = $peersQ->get();

        // взаимодействия (peer_recognitions за последние 90 дней)
        $interactions = [];
        $recs = DB::table('peer_recognitions')
            ->where(function ($q) use ($target) {
                $q->where('from_user_id', $target->user_id)
                  ->orWhere('to_user_id', $target->user_id);
            })
            ->where('created_at', '>=', now()->subDays(90))
            ->select('from_user_id', 'to_user_id')
            ->get();
        $counts = [];
        foreach ($recs as $r) {
            $other = $r->from_user_id === $target->user_id ? $r->to_user_id : $r->from_user_id;
            $counts[$other] = ($counts[$other] ?? 0) + 1;
        }
        foreach ($counts as $uid => $w) {
            $interactions[] = ['with_user_id' => $uid, 'type' => 'recognition', 'weight' => $w];
        }

        // картина через год: активный трек + следующая позиция
        $future = null;
        $assignment = DB::table('employee_career_assignments')
            ->where('user_id', $target->user_id)
            ->where('status', 'active')
            ->first();
        if ($assignment) {
            $tpl = DB::table('career_track_templates')->where('id', $assignment->template_id)->first();
            $targetPosition = null;
            if ($tpl && !empty($tpl->to_position_id ?? null)) {
                $pos = DB::table('positions')->where('id', $tpl->to_position_id)->first();
                if ($pos) $targetPosition = ['id' => $pos->id, 'title' => $pos->title, 'level' => $pos->level ?? null];
            }
            $expectedSkills = [];
            $steps = $tpl ? json_decode($tpl->steps ?? '[]', true) : [];
            if (is_array($steps)) {
                foreach ($steps as $i => $st) {
                    if ($i < ($assignment->current_step ?? 0)) continue;
                    if (!empty($st['skills']) && is_array($st['skills'])) {
                        $expectedSkills = array_merge($expectedSkills, $st['skills']);
                    }
                    if (!empty($st['goals']) && is_array($st['goals'])) {
                        $expectedSkills = array_merge($expectedSkills, $st['goals']);
                    }
                }
            }
            $future = [
                'target_position' => $targetPosition,
                'track_template'  => $tpl ? ['id' => $tpl->id, 'title' => $tpl->title ?? null] : null,
                'current_step'    => $assignment->current_step ?? 0,
                'total_steps'     => is_array($steps) ? count($steps) : 0,
                'expected_items'  => array_values(array_unique(array_slice($expectedSkills, 0, 12))),
            ];
        }
        if (!$future && $target->position_id) {
            $path = DB::table('position_career_paths')
                ->where('from_position_id', $target->position_id)
                ->first();
            if ($path && !empty($path->to_position_id)) {
                $pos = DB::table('positions')->where('id', $path->to_position_id)->first();
                if ($pos) {
                    $future = [
                        'target_position' => ['id' => $pos->id, 'title' => $pos->title, 'level' => $pos->level ?? null],
                        'track_template'  => null,
                        'current_step'    => 0,
                        'total_steps'     => 0,
                        'expected_items'  => [],
                    ];
                }
            }
        }

        $targetEmail = DB::table('users')->where('id', $target->user_id)->value('email');

        return response()->json([
            'user' => [
                'user_id'   => $target->user_id,
                'full_name' => $target->full_name,
                'position'  => $target->position,
                'department'=> $target->department,
                'avatar_url'=> $target->avatar_url,
                'email'     => $targetEmail,
            ],
            'manager'         => $manager,
            'direct_reports'  => $directReports,
            'department_head' => $departmentHead,
            'peers'           => $peers,
            'interactions'    => $interactions,
            'future_projection' => $future,
        ]);
    }

    /* ---------- helpers ---------- */

    private function loadTarget(string $userId): Profile
    {
        return Profile::where('user_id', $userId)->firstOrFail();
    }

    private function authorizeAccess(Profile $target): void
    {
        $actor = auth()->user();
        if (!$actor) abort(401);

        if (method_exists($actor, 'hasRole') && $actor->hasRole('superadmin')) return;

        $actorCompany = method_exists($actor, 'companyId') ? $actor->companyId() : null;

        // self
        if ($actor->id === $target->user_id) return;

        // менеджер по team_members
        $isManagerOf = DB::table('team_members')
            ->where('manager_id', $actor->id)
            ->where('employee_id', $target->user_id)
            ->exists();
        if ($isManagerOf) return;

        // HRD / company_admin своей компании
        if (method_exists($actor, 'hasRole')
            && ($actor->hasRole('hrd') || $actor->hasRole('company_admin'))
            && $actorCompany && $actorCompany === $target->company_id) {
            return;
        }

        abort(403, 'Нет прав на просмотр окружения сотрудника');
    }
}
