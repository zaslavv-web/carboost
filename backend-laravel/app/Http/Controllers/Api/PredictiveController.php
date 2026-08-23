<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Analytics\AttritionPredictionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Epic D3 — предиктивная аналитика, драйверы текучести (SHAP),
 * отраслевые бенчмарки и калькулятор сценариев «что если».
 */
class PredictiveController extends Controller
{
    public function __construct(protected AttritionPredictionService $svc) {}

    private function companyId(): string
    {
        $u = Auth::user();
        return (string) (method_exists($u, 'companyId') ? ($u->companyId() ?: '') : '');
    }

    private function canManage(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hr', 'hrd', 'company_admin', 'superadmin']);
    }

    private function deny()
    {
        return response()->json(['error' => 'forbidden'], 403);
    }

    // ---------- D3.1 Прогноз увольнений ----------

    public function overview(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'company_required'], 422);

        $horizon = (int) $r->query('horizon_days', 180);
        if (! in_array($horizon, [90, 180, 365], true)) $horizon = 180;

        $rows = DB::table('attrition_predictions')
            ->where('company_id', $companyId)
            ->where('horizon_days', $horizon)
            ->get(['probability', 'band', 'computed_at', 'base_rate']);

        $headcount = (int) DB::table('profiles')->where('company_id', $companyId)->count();
        $count = $rows->count();
        $avg = $count ? $rows->avg('probability') : 0;

        $metrics = DB::table('attrition_model_metrics')
            ->where('company_id', $companyId)
            ->orderByDesc('evaluated_at')
            ->first();

        return response()->json([
            'headcount' => $headcount,
            'scored' => $count,
            'avg_probability' => round((float) $avg, 4),
            'base_rate' => (float) ($rows->first()->base_rate ?? 0),
            'expected_leavers' => round($rows->sum('probability'), 1),
            'bands' => [
                'high' => $rows->where('band', 'high')->count(),
                'medium' => $rows->where('band', 'medium')->count(),
                'low' => $rows->where('band', 'low')->count(),
            ],
            'computed_at' => optional($rows->first())->computed_at,
            'model_version' => AttritionPredictionService::MODEL_VERSION,
            'model_metrics' => $metrics,
        ]);
    }

    public function recompute(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'company_required'], 422);

        $horizon = (int) $r->input('horizon_days', 180);
        $res = $this->svc->recomputeCompany($companyId, in_array($horizon, [90, 180, 365]) ? $horizon : 180);
        $res['metrics'] = $this->svc->evaluate($companyId);

        return response()->json($res);
    }

    public function employees(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'company_required'], 422);

        $q = DB::table('attrition_predictions as ap')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'ap.user_id')
            ->where('ap.company_id', $companyId)
            ->where('ap.horizon_days', (int) ($r->query('horizon_days') ?: 180))
            ->select([
                'ap.user_id', 'ap.probability', 'ap.band', 'ap.drivers', 'ap.computed_at',
                'p.full_name', 'p.position', 'p.department', 'p.avatar_url',
            ]);

        if ($band = $r->query('band')) $q->where('ap.band', $band);
        if ($dep = $r->query('department')) $q->where('p.department', $dep);
        if ($s = $r->query('search')) $q->where('p.full_name', 'like', '%' . $s . '%');

        $rows = $q->orderByDesc('ap.probability')->limit((int) $r->query('limit', 200))->get();

        $out = $rows->map(function ($row) {
            $drivers = json_decode((string) $row->drivers, true) ?: [];
            return [
                'user_id' => (string) $row->user_id,
                'full_name' => $row->full_name,
                'position' => $row->position,
                'department' => $row->department,
                'avatar_url' => $row->avatar_url,
                'probability' => (float) $row->probability,
                'band' => $row->band,
                'top_drivers' => array_slice(array_values(array_filter($drivers, fn ($d) => ($d['shap'] ?? 0) > 0)), 0, 3),
                'computed_at' => $row->computed_at,
            ];
        });

        return response()->json(['data' => $out]);
    }

    public function employee(Request $r, string $userId)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();

        $row = DB::table('attrition_predictions as ap')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'ap.user_id')
            ->where('ap.company_id', $companyId)
            ->where('ap.user_id', $userId)
            ->select(['ap.*', 'p.full_name', 'p.position', 'p.department', 'p.avatar_url'])
            ->first();

        if (! $row) return response()->json(['error' => 'not_found'], 404);

        return response()->json([
            'user_id' => (string) $row->user_id,
            'full_name' => $row->full_name,
            'position' => $row->position,
            'department' => $row->department,
            'avatar_url' => $row->avatar_url,
            'probability' => (float) $row->probability,
            'band' => $row->band,
            'base_rate' => (float) $row->base_rate,
            'horizon_days' => (int) $row->horizon_days,
            'features' => json_decode((string) $row->features, true) ?: [],
            'drivers' => json_decode((string) $row->drivers, true) ?: [],
            'computed_at' => $row->computed_at,
        ]);
    }

    // ---------- D3.2 SHAP-анализ драйверов ----------

    public function drivers(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();

        $q = DB::table('attrition_predictions as ap')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'ap.user_id')
            ->where('ap.company_id', $companyId);
        if ($dep = $r->query('department')) $q->where('p.department', $dep);

        $rows = $q->get(['ap.drivers']);
        $agg = [];
        foreach ($rows as $row) {
            foreach (json_decode((string) $row->drivers, true) ?: [] as $d) {
                $k = $d['feature'];
                $agg[$k] ??= ['feature' => $k, 'label' => $d['label'], 'action' => $d['action'], 'sum_abs' => 0.0, 'sum' => 0.0, 'affected' => 0];
                $agg[$k]['sum_abs'] += abs((float) $d['shap']);
                $agg[$k]['sum'] += (float) $d['shap'];
                if ((float) $d['shap'] > 0.05) $agg[$k]['affected']++;
            }
        }

        $n = max(1, $rows->count());
        $total = max(1e-9, array_sum(array_column($agg, 'sum_abs')));
        $out = array_map(function ($a) use ($n, $total) {
            return [
                'feature' => $a['feature'],
                'label' => $a['label'],
                'action' => $a['action'],
                'mean_abs_shap' => round($a['sum_abs'] / $n, 4),
                'direction' => $a['sum'] >= 0 ? 'increases' : 'decreases',
                'share' => round(100 * $a['sum_abs'] / $total, 1),
                'affected_employees' => $a['affected'],
            ];
        }, array_values($agg));

        usort($out, fn ($x, $y) => $y['mean_abs_shap'] <=> $x['mean_abs_shap']);

        return response()->json(['sample' => $rows->count(), 'drivers' => $out]);
    }

    // ---------- D3.3 Бенчмарки ----------

    public function benchmarks(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();

        $company = DB::table('companies')->where('id', $companyId)->first();
        $industry = (string) ($company->industry ?? 'all') ?: 'all';

        $bench = DB::table('industry_benchmarks')
            ->whereIn('industry', array_unique([$industry, 'all']))
            ->get();

        $actual = $this->companyMetrics($companyId);

        $items = [];
        foreach ($bench->where('industry', $industry)->count() ? $bench->where('industry', $industry) : $bench as $b) {
            $value = $actual[$b->metric] ?? null;
            $position = null;
            if ($value !== null) {
                if ($b->lower_is_better) {
                    $position = $value <= (float) $b->p25 ? 'top' : ($value <= (float) $b->p50 ? 'above_median' : ($value <= (float) $b->p75 ? 'below_median' : 'bottom'));
                } else {
                    $position = $value >= (float) $b->p75 ? 'top' : ($value >= (float) $b->p50 ? 'above_median' : ($value >= (float) $b->p25 ? 'below_median' : 'bottom'));
                }
            }
            $items[] = [
                'metric' => $b->metric,
                'unit' => $b->unit,
                'p25' => (float) $b->p25,
                'p50' => (float) $b->p50,
                'p75' => (float) $b->p75,
                'lower_is_better' => (bool) $b->lower_is_better,
                'company_value' => $value,
                'position' => $position,
                'source' => $b->source,
                'period' => $b->period,
            ];
        }

        return response()->json([
            'industry' => $industry,
            'company' => [
                'industry' => $company->industry ?? null,
                'headcount_band' => $company->headcount_band ?? null,
                'replacement_cost' => isset($company->replacement_cost) ? (int) $company->replacement_cost : null,
            ],
            'benchmarks' => $items,
        ]);
    }

    public function updateCompanyProfile(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();
        $data = $r->validate([
            'industry' => 'nullable|string|max:64',
            'headcount_band' => 'nullable|string|max:24',
            'replacement_cost' => 'nullable|integer|min:0|max:100000000',
        ]);
        $patch = array_filter($data, fn ($v) => $v !== null);
        if ($patch) DB::table('companies')->where('id', $companyId)->update($patch);
        return response()->json(['ok' => true] + $patch);
    }

    /** Фактические метрики компании для сравнения с бенчмарками. */
    private function companyMetrics(string $companyId): array
    {
        $headcount = max(1, (int) DB::table('profiles')->where('company_id', $companyId)->count());
        $out = [];

        // Прогнозная годовая текучесть = ожидаемые уходы / штат (горизонт 180 дней → x2)
        $expected = (float) DB::table('attrition_predictions')->where('company_id', $companyId)->sum('probability');
        if ($expected > 0) {
            $out['turnover_rate'] = round(min(100, 100 * $expected * 2 / $headcount), 1);
            $out['voluntary_turnover'] = round($out['turnover_rate'] * 0.7, 1);
        }

        if (Schema::hasTable('employee_risk_scores')) {
            $eng = DB::table('employee_risk_scores')->where('company_id', $companyId)->avg('engagement_score');
            if ($eng !== null) $out['engagement'] = round((float) $eng, 1);
        }

        if (Schema::hasTable('leave_requests')) {
            $days = (int) DB::table('leave_requests as lr')
                ->join('profiles as p', 'p.user_id', '=', 'lr.user_id')
                ->where('p.company_id', $companyId)
                ->where('lr.created_at', '>=', now()->subDays(365))
                ->count();
            $out['absenteeism'] = round(min(100, 100 * $days / ($headcount * 22)), 2);
        }

        if (Schema::hasTable('enrollments')) {
            $completed = (int) DB::table('enrollments as e')
                ->join('profiles as p', 'p.user_id', '=', 'e.user_id')
                ->where('p.company_id', $companyId)
                ->where('e.status', 'completed')
                ->where('e.updated_at', '>=', now()->subDays(365))
                ->count();
            $out['training_hours'] = round($completed * 4 / $headcount, 1); // ~4 ч на курс
        }

        return $out;
    }

    // ---------- D3.4 «Что если» ----------

    public function whatIf(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $companyId = $this->companyId();

        $data = $r->validate([
            'levers' => 'required|array',
            'levers.*' => 'numeric|min:0|max:1',
            'replacement_cost' => 'nullable|integer|min:0',
        ]);

        $cost = (int) ($data['replacement_cost'] ?? 0);
        if (! $cost) {
            $cost = (int) (DB::table('companies')->where('id', $companyId)->value('replacement_cost') ?? 0);
        }

        return response()->json($this->svc->simulate($companyId, $data['levers'], $cost));
    }

    public function indexScenarios()
    {
        if (! $this->canManage()) return $this->deny();
        return response()->json(
            DB::table('whatif_scenarios')->where('company_id', $this->companyId())->orderByDesc('created_at')->limit(50)->get()
        );
    }

    public function storeScenario(Request $r)
    {
        if (! $this->canManage()) return $this->deny();
        $data = $r->validate([
            'name' => 'required|string|max:160',
            'description' => 'nullable|string|max:2000',
            'params' => 'required|array',
            'result' => 'nullable|array',
        ]);
        $id = (string) Str::uuid();
        DB::table('whatif_scenarios')->insert([
            'id' => $id,
            'company_id' => $this->companyId(),
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'params' => json_encode($data['params'], JSON_UNESCAPED_UNICODE),
            'result' => json_encode($data['result'] ?? [], JSON_UNESCAPED_UNICODE),
            'created_by' => (string) Auth::id(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json(['id' => $id], 201);
    }

    public function destroyScenario(string $id)
    {
        if (! $this->canManage()) return $this->deny();
        DB::table('whatif_scenarios')->where('company_id', $this->companyId())->where('id', $id)->delete();
        return response()->json(null, 204);
    }
}
