<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Automation\ComfortAnalysisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Comfort Analytics API (Волна 7).
 *
 * Доступ: hrd | company_admin | superadmin — по всей компании.
 * Менеджеры — только по своим подчинённым (team_members.manager_id = auth.id).
 * Сотрудник — только по себе (`/comfort/user/{self}`).
 */
class ComfortController extends Controller
{
    public function __construct(protected ComfortAnalysisService $svc) {}

    public function recompute(Request $r): JsonResponse
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $u = Auth::user();
        $companyId = (string) ($r->input('company_id') ?: $u->company_id ?: '');
        if (! $companyId) return response()->json(['error' => 'company_id required'], 422);
        $r = $this->svc->computeForCompany($companyId);
        return response()->json($r);
    }

    public function company(Request $r): JsonResponse
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = $this->companyId($r);
        if (! $companyId) return response()->json(['error' => 'company required'], 422);

        $company = DB::table('comfort_scores')
            ->where('company_id', $companyId)->where('scope', 'company')
            ->orderByDesc('period_start')->first();

        $departments = DB::table('comfort_scores')
            ->where('company_id', $companyId)->where('scope', 'department')
            ->orderByDesc('period_start')
            ->get()
            ->groupBy('scope_id')
            ->map(fn ($g) => $g->first())
            ->values();

        // подтягиваем имя отдела
        $deptIds = $departments->pluck('scope_id')->filter()->all();
        $deptNames = DB::table('departments')->whereIn('id', $deptIds)->pluck('name', 'id');
        $departments = $departments->map(function ($d) use ($deptNames) {
            $d->name = $d->scope_id ? ($deptNames[$d->scope_id] ?? '—') : 'Без отдела';
            $d->factors = $this->jd($d->factors);
            return $d;
        });

        // тренд 90 дней по компании
        $trend = DB::table('comfort_scores')
            ->where('company_id', $companyId)->where('scope', 'company')
            ->where('period_start', '>=', now()->subDays(90)->toDateString())
            ->orderBy('period_start')
            ->get(['period_start', 'comfort_index', 'tov_score', 'kpi_score', 'career_score']);

        // топ рисковых руководителей: считаем как менеджеров с высоким долей high/critical в подчинённых
        $managers = $this->topRiskyManagers($companyId);

        return response()->json([
            'company' => $company ? $this->decorate($company) : null,
            'departments' => $departments,
            'trend' => $trend,
            'top_risky_managers' => $managers,
        ]);
    }

    public function department(Request $r, string $id): JsonResponse
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = $this->companyId($r);
        $dept = DB::table('comfort_scores')
            ->where('company_id', $companyId)->where('scope', 'department')->where('scope_id', $id)
            ->orderByDesc('period_start')->first();

        $deptName = DB::table('departments')->where('id', $id)->value('name');

        $employees = DB::table('profiles as p')
            ->leftJoin('comfort_scores as cs', function ($j) {
                $j->on('cs.scope_id', '=', 'p.user_id')->where('cs.scope', '=', 'user');
            })
            ->where('p.company_id', $companyId)
            ->where('p.department', $deptName)
            ->select('p.user_id', 'p.full_name', 'p.position', 'p.avatar_url',
                'cs.comfort_index', 'cs.tov_score', 'cs.kpi_score', 'cs.career_score',
                'cs.risk_level', 'cs.trend', 'cs.trend_delta')
            ->orderByRaw('cs.comfort_index asc nulls last')
            ->get();

        return response()->json([
            'department' => $dept ? $this->decorate($dept) : null,
            'name' => $deptName,
            'employees' => $employees,
        ]);
    }

    public function user(Request $r, string $id): JsonResponse
    {
        $auth = Auth::user();
        $isSelf = $auth && (string) $auth->id === (string) $id;
        if (! $isSelf && ! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $companyId = $this->companyId($r);

        $score = DB::table('comfort_scores')
            ->where('scope', 'user')->where('scope_id', $id)
            ->orderByDesc('period_start')->first();
        $profile = DB::table('profiles')->where('user_id', $id)->first();

        $signals = DB::table('comfort_signal_events')
            ->where('user_id', $id)
            ->orderByDesc('occurred_at')
            ->limit(50)
            ->get();

        $trend = DB::table('comfort_scores')
            ->where('scope', 'user')->where('scope_id', $id)
            ->orderBy('period_start')
            ->get(['period_start', 'comfort_index', 'tov_score', 'kpi_score', 'career_score']);

        return response()->json([
            'user' => $profile,
            'score' => $score ? $this->decorate($score) : null,
            'signals' => $signals,
            'trend' => $trend,
        ]);
    }

    // ---------- helpers ----------

    private function topRiskyManagers(string $companyId): array
    {
        if (! DB::getSchemaBuilder()->hasTable('team_members')) return [];
        $rows = DB::table('team_members as tm')
            ->join('comfort_scores as cs', function ($j) {
                $j->on('cs.scope_id', '=', 'tm.employee_id')->where('cs.scope', '=', 'user');
            })
            ->where('cs.company_id', $companyId)
            ->select('tm.manager_id',
                DB::raw('count(*) as team_size'),
                DB::raw("sum(case when cs.risk_level in ('high','critical') then 1 else 0 end) as risky"),
                DB::raw('avg(cs.comfort_index) as avg_idx'))
            ->groupBy('tm.manager_id')
            ->having('team_size', '>=', 2)
            ->orderByDesc('risky')
            ->orderBy('avg_idx')
            ->limit(5)
            ->get();

        $ids = $rows->pluck('manager_id')->all();
        $names = DB::table('profiles')->whereIn('user_id', $ids)->pluck('full_name', 'user_id');
        return $rows->map(fn ($r) => [
            'manager_id' => $r->manager_id,
            'name' => $names[$r->manager_id] ?? '—',
            'team_size' => (int) $r->team_size,
            'risky' => (int) $r->risky,
            'avg_index' => round((float) $r->avg_idx, 1),
        ])->all();
    }

    private function decorate($row): array
    {
        $row = (array) $row;
        $row['factors'] = $this->jd($row['factors'] ?? null);
        $row['recommendations'] = $this->jd($row['recommendations'] ?? null);
        return $row;
    }

    private function jd($v)
    {
        if (is_string($v)) return json_decode($v, true) ?? [];
        return $v ?? [];
    }

    private function canManage(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hrd', 'company_admin', 'superadmin']);
    }

    private function companyId(Request $r): ?string
    {
        $u = Auth::user();
        if (! $u) return null;
        if ($r->input('company_id') && $this->hasRole($u->id, 'superadmin')) {
            return (string) $r->input('company_id');
        }
        return $u->company_id ? (string) $u->company_id : null;
    }

    private function hasRole($uid, string $role): bool
    {
        return DB::table('user_roles')->where('user_id', $uid)->where('role', $role)->exists();
    }
}
