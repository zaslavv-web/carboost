<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * People Analytics — сводная HR-аналитика по сотрудникам компании.
 *
 * Все запросы скоупятся по company_id текущего пользователя (или переданному
 * для superadmin). Доступ — HRD/company_admin/superadmin.
 *
 * Endpoints:
 *   GET /api/people-analytics/headcount   — численность по департаментам/позициям
 *   GET /api/people-analytics/tenure      — распределение по стажу
 *   GET /api/people-analytics/hiring      — динамика найма по месяцам (12 мес)
 *   GET /api/people-analytics/absence     — отсутствия по месяцам (approved days)
 *   GET /api/people-analytics/risk        — распределение сотрудников по риск-баллу
 */
class PeopleAnalyticsController extends Controller
{
    public function headcount(Request $request): JsonResponse
    {
        $companyId = $this->scope($request);

        $byDept = DB::table('profiles')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->selectRaw("COALESCE(NULLIF(department, ''), 'Без департамента') as label, COUNT(*) as value")
            ->groupBy('label')
            ->orderByDesc('value')
            ->get();

        $byPosition = DB::table('profiles')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->selectRaw("COALESCE(NULLIF(position, ''), 'Не задано') as label, COUNT(*) as value")
            ->groupBy('label')
            ->orderByDesc('value')
            ->limit(15)
            ->get();

        $total = DB::table('profiles')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->count();

        return response()->json([
            'total'       => $total,
            'by_department' => $byDept,
            'by_position'   => $byPosition,
        ]);
    }

    public function tenure(Request $request): JsonResponse
    {
        $companyId = $this->scope($request);

        $rows = DB::table('profiles')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->whereNotNull('hire_date')
            ->select('hire_date')
            ->get();

        $buckets = [
            '< 3 мес'   => 0,
            '3–12 мес' => 0,
            '1–3 года' => 0,
            '3–5 лет'  => 0,
            '> 5 лет'  => 0,
        ];
        $now = Carbon::now();
        foreach ($rows as $r) {
            $months = Carbon::parse($r->hire_date)->diffInMonths($now);
            if ($months < 3)         $buckets['< 3 мес']++;
            elseif ($months < 12)    $buckets['3–12 мес']++;
            elseif ($months < 36)    $buckets['1–3 года']++;
            elseif ($months < 60)    $buckets['3–5 лет']++;
            else                     $buckets['> 5 лет']++;
        }

        $result = [];
        foreach ($buckets as $label => $value) {
            $result[] = ['label' => $label, 'value' => $value];
        }
        return response()->json(['buckets' => $result, 'total_with_hire_date' => count($rows)]);
    }

    public function hiring(Request $request): JsonResponse
    {
        $companyId = $this->scope($request);
        $start = Carbon::now()->startOfMonth()->subMonths(11);

        // Group in PHP: the production database is MySQL while older code used
        // PostgreSQL-only to_char/date casts and silently returned an empty chart.
        $rows = DB::table('profiles')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->whereNotNull('hire_date')
            ->where('hire_date', '>=', $start->toDateString())
            ->pluck('hire_date')
            ->map(fn ($date) => Carbon::parse($date)->format('Y-m'))
            ->countBy();

        $series = [];
        for ($i = 0; $i < 12; $i++) {
            $key = $start->copy()->addMonths($i)->format('Y-m');
            $series[] = [
                'month' => $key,
                'value' => (int) ($rows[$key] ?? 0),
            ];
        }
        return response()->json(['series' => $series]);
    }

    public function absence(Request $request): JsonResponse
    {
        $companyId = $this->scope($request);
        $start = Carbon::now()->startOfMonth()->subMonths(5);

        if (!DB::getSchemaBuilder()->hasTable('leave_requests')) {
            return response()->json(['series' => []]);
        }

        // `leave_requests` stores days_count (not business_days). Aggregate in
        // PHP to remain portable between MySQL and PostgreSQL deployments.
        $rows = DB::table('leave_requests')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->where('status', 'approved')
            ->where('start_date', '>=', $start->toDateString())
            ->get(['start_date', 'days_count'])
            ->groupBy(fn ($row) => Carbon::parse($row->start_date)->format('Y-m'))
            ->map(fn ($group) => (object) [
                'days' => $group->sum(fn ($row) => (float) $row->days_count),
                'requests' => $group->count(),
            ]);

        $headcount = max(1, DB::table('profiles')->when($companyId, fn ($q) => $q->where('company_id', $companyId))->count());

        $series = [];
        for ($i = 0; $i < 6; $i++) {
            $key = $start->copy()->addMonths($i)->format('Y-m');
            $series[] = [
                'month'    => $key,
                'days'     => (float) ($rows[$key]->days ?? 0),
                'requests' => (int) ($rows[$key]->requests ?? 0),
                'rate'     => round(((float) ($rows[$key]->days ?? 0) / ($headcount * max(1, $start->copy()->addMonths($i)->daysInMonth))) * 100, 2),
            ];
        }
        return response()->json(['series' => $series]);
    }

    public function risk(Request $request): JsonResponse
    {
        $companyId = $this->scope($request);
        if (!DB::getSchemaBuilder()->hasTable('employee_risk_scores')) {
            return response()->json(['buckets' => []]);
        }
        // FIX: схема таблицы содержит risk_level (text) + attrition_risk/burnout_risk (int),
        // а не risk_score. Раньше SQL падал с 500 из-за отсутствующего столбца.
        try {
            $rows = DB::table('employee_risk_scores')
                ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
                ->selectRaw("
                    SUM(CASE WHEN risk_level = 'low'      THEN 1 ELSE 0 END) as low,
                    SUM(CASE WHEN risk_level = 'medium'   THEN 1 ELSE 0 END) as mid,
                    SUM(CASE WHEN risk_level = 'high'     THEN 1 ELSE 0 END) as high,
                    SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) as critical
                ")
                ->first();
        } catch (\Throwable $e) {
            report($e);
            $rows = null;
        }
        return response()->json([
            'buckets' => [
                ['label' => 'Низкий',       'value' => (int) ($rows->low ?? 0)],
                ['label' => 'Средний',      'value' => (int) ($rows->mid ?? 0)],
                ['label' => 'Высокий',      'value' => (int) ($rows->high ?? 0)],
                ['label' => 'Критический',  'value' => (int) ($rows->critical ?? 0)],
            ],
        ]);
    }

    private function scope(Request $request): ?string
    {
        $user = $request->user();
        abort_unless($user, 401);

        $isAdmin = $user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin');
        abort_unless($isAdmin, 403);

        // Superadmin может явно указать company_id, иначе — все компании.
        if ($user->hasRole('superadmin')) {
            return $request->get('company_id') ?: null;
        }
        return method_exists($user, 'companyId') ? $user->companyId() : null;
    }
}
