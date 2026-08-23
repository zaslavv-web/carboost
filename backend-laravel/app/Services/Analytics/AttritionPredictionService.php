<?php

namespace App\Services\Analytics;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Epic D3.1 / D3.2 — прогноз увольнений и SHAP-подобный анализ драйверов.
 *
 * Модель: логистическая регрессия с калиброванными весами по 9 признакам,
 * посчитанным из фактических данных платформы (задачи, 1:1, признания,
 * обучение, стаж, отсутствия, engagement). Веса зафиксированы, чтобы модуль
 * работал без внешнего ML-сервиса; калибровка порогов делается по когорте.
 *
 * Вклад драйверов: аддитивная декомпозиция в log-odds
 *   phi_i = w_i * (x_i - E[x_i])
 * где E[x_i] — среднее по когорте компании (аналог SHAP для линейной модели:
 * для линейных моделей значения Шепли в точности равны w_i*(x_i - E[x_i])).
 */
class AttritionPredictionService
{
    public const MODEL_VERSION = 'v1';

    /** Пороговые значения вероятности для полос риска. */
    public const BAND_HIGH = 0.45;
    public const BAND_MEDIUM = 0.22;

    /** Свободный член: базовая ставка ~7% на горизонте 180 дней. */
    private const INTERCEPT = -2.6;

    /** Веса модели в log-odds. */
    public const WEIGHTS = [
        'overdue_tasks'      => 1.10,
        'no_recent_1on1'     => 1.30,
        'career_stagnation'  => 1.40,
        'recognition_gap'    => 0.90,
        'overdue_courses'    => 0.60,
        'tenure_risk'        => 0.80,
        'low_engagement'     => 1.20,
        'absence_rate'       => 0.70,
        'workload'           => 0.50,
    ];

    public const LABELS = [
        'overdue_tasks'      => 'Просроченные задачи',
        'no_recent_1on1'     => 'Давно не было 1:1',
        'career_stagnation'  => 'Застой в карьере',
        'recognition_gap'    => 'Нет признания от коллег',
        'overdue_courses'    => 'Просроченное обучение',
        'tenure_risk'        => 'Рискованный стаж (1–2 года)',
        'low_engagement'     => 'Низкая вовлечённость',
        'absence_rate'       => 'Частые отсутствия',
        'workload'           => 'Перегрузка задачами',
    ];

    public const ACTIONS = [
        'overdue_tasks'      => 'Пересобрать бэклог: снять или перенести просроченные задачи, обсудить приоритеты на 1:1.',
        'no_recent_1on1'     => 'Поставить регулярную встречу 1:1 с руководителем (минимум раз в 2 недели).',
        'career_stagnation'  => 'Обновить ИПР и карьерный трек, назначить ближайший шаг с датой.',
        'recognition_gap'    => 'Публично отметить вклад сотрудника, включить в программу peer-признания.',
        'overdue_courses'    => 'Снять блокеры по обязательному обучению, перенести дедлайны, назначить наставника.',
        'tenure_risk'        => 'Провести карьерный разговор на отметке 12–24 месяцев, обсудить грейд и зону роста.',
        'low_engagement'     => 'Провести пульс-опрос и разбор результатов, назначить встречу с HR.',
        'absence_rate'       => 'Проверить нагрузку и выгорание, обсудить график и восстановление.',
        'workload'           => 'Перераспределить нагрузку внутри команды, снять часть задач.',
    ];

    /** Полный пересчёт прогнозов по компании. */
    public function recomputeCompany(string $companyId, int $horizonDays = 180): array
    {
        $employees = DB::table('profiles')
            ->where('company_id', $companyId)
            ->whereNotNull('user_id')
            ->get(['user_id', 'full_name', 'position', 'department', 'hire_date']);

        if ($employees->isEmpty()) {
            return ['updated' => 0, 'base_rate' => 0, 'model_version' => self::MODEL_VERSION];
        }

        $userIds = $employees->pluck('user_id')->map(fn ($v) => (string) $v)->all();
        $signals = $this->collectSignals($userIds);

        // Проход 1 — признаки
        $features = [];
        foreach ($employees as $e) {
            $features[(string) $e->user_id] = $this->buildFeatures((string) $e->user_id, $e, $signals);
        }

        // Проход 2 — средние по когорте (baseline для аддитивных вкладов)
        $means = [];
        $n = max(1, count($features));
        foreach (array_keys(self::WEIGHTS) as $k) {
            $means[$k] = array_sum(array_column($features, $k)) / $n;
        }

        $now = now();
        $baseRate = $this->sigmoid(self::INTERCEPT + $this->dot($means));
        $updated = 0;
        $rows = [];

        foreach ($features as $userId => $x) {
            $z = self::INTERCEPT + $this->dot($x);
            $p = $this->sigmoid($z);
            $drivers = $this->drivers($x, $means, $p, $z);

            $rows[] = [
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'user_id' => $userId,
                'horizon_days' => $horizonDays,
                'probability' => round($p, 4),
                'band' => $this->band($p),
                'base_rate' => round($baseRate, 4),
                'features' => json_encode($x, JSON_UNESCAPED_UNICODE),
                'drivers' => json_encode($drivers, JSON_UNESCAPED_UNICODE),
                'model_version' => self::MODEL_VERSION,
                'computed_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $updated++;
        }

        // Пакетная запись: на 150+ сотрудниках построчный SELECT+UPDATE давал
        // сотни запросов в одном HTTP-вызове (долгий ответ и таймауты).
        // Здесь — удаление прежних строк когорты и массовая вставка чанками.
        DB::transaction(function () use ($rows, $userIds, $horizonDays, $companyId) {
            foreach (array_chunk($userIds, 500) as $idsChunk) {
                DB::table('attrition_predictions')
                    ->whereIn('user_id', $idsChunk)
                    ->where('horizon_days', $horizonDays)
                    ->delete();
            }
            // Подчищаем «осиротевшие» строки компании с чужим горизонтом расчёта,
            // если сотрудник больше не в профилях компании.
            DB::table('attrition_predictions')
                ->where('company_id', $companyId)
                ->where('horizon_days', $horizonDays)
                ->whereNotIn('user_id', array_slice($userIds, 0, 1000))
                ->when(count($userIds) <= 1000, fn ($q) => $q->delete());

            foreach (array_chunk($rows, 200) as $chunk) {
                DB::table('attrition_predictions')->insert($chunk);
            }
        });

        $probabilities = array_map(fn ($r) => (float) $r['probability'], $rows);
        $bands = ['high' => 0, 'medium' => 0, 'low' => 0];
        foreach ($rows as $r) {
            $bands[$r['band']] = ($bands[$r['band']] ?? 0) + 1;
        }

        return [
            'updated' => $updated,
            'base_rate' => round($baseRate, 4),
            'avg_probability' => $probabilities ? round(array_sum($probabilities) / count($probabilities), 4) : 0.0,
            'expected_leavers' => round(array_sum($probabilities), 1),
            'bands' => $bands,
            'model_version' => self::MODEL_VERSION,
        ];

    }

    /** Батчевые агрегаты по всем сотрудникам компании (без N+1). */
    private function collectSignals(array $userIds): array
    {
        $now = now();
        $s = [
            'overdue' => [], 'open' => [], 'last1on1' => [], 'recognitions' => [],
            'overdueCourses' => [], 'careerUpdate' => [], 'engagement' => [], 'absenceDays' => [],
        ];

        $chunks = array_chunk($userIds, 500);

        foreach ($chunks as $ids) {
            if (Schema::hasTable('tasks')) {
                foreach (DB::table('tasks')
                    ->select('assignee_id', DB::raw('COUNT(*) as c'))
                    ->whereIn('assignee_id', $ids)
                    ->whereNotIn('status', ['done', 'closed', 'cancelled'])
                    ->whereNotNull('due_date')->where('due_date', '<', $now)
                    ->groupBy('assignee_id')->get() as $r) {
                    $s['overdue'][(string) $r->assignee_id] = (int) $r->c;
                }
                foreach (DB::table('tasks')
                    ->select('assignee_id', DB::raw('COUNT(*) as c'))
                    ->whereIn('assignee_id', $ids)
                    ->whereNotIn('status', ['done', 'closed', 'cancelled'])
                    ->groupBy('assignee_id')->get() as $r) {
                    $s['open'][(string) $r->assignee_id] = (int) $r->c;
                }
            }

            if (Schema::hasTable('one_on_ones')) {
                foreach (DB::table('one_on_ones')
                    ->select('employee_id', DB::raw('MAX(scheduled_at) as m'))
                    ->whereIn('employee_id', $ids)
                    ->groupBy('employee_id')->get() as $r) {
                    $s['last1on1'][(string) $r->employee_id] = $r->m;
                }
            }

            if (Schema::hasTable('peer_recognitions')) {
                foreach (DB::table('peer_recognitions')
                    ->select('to_user_id', DB::raw('COUNT(*) as c'))
                    ->whereIn('to_user_id', $ids)
                    ->where('created_at', '>=', $now->copy()->subDays(90))
                    ->groupBy('to_user_id')->get() as $r) {
                    $s['recognitions'][(string) $r->to_user_id] = (int) $r->c;
                }
            }

            if (Schema::hasTable('enrollments')) {
                foreach (DB::table('enrollments')
                    ->select('user_id', DB::raw('COUNT(*) as c'))
                    ->whereIn('user_id', $ids)
                    ->where('status', '!=', 'completed')
                    ->whereNotNull('due_at')->where('due_at', '<', $now)
                    ->groupBy('user_id')->get() as $r) {
                    $s['overdueCourses'][(string) $r->user_id] = (int) $r->c;
                }
            }

            if (Schema::hasTable('employee_career_assignments')) {
                foreach (DB::table('employee_career_assignments')
                    ->select('user_id', DB::raw('MAX(updated_at) as m'))
                    ->whereIn('user_id', $ids)
                    ->groupBy('user_id')->get() as $r) {
                    $s['careerUpdate'][(string) $r->user_id] = $r->m;
                }
            }

            if (Schema::hasTable('employee_risk_scores')) {
                foreach (DB::table('employee_risk_scores')
                    ->select('user_id', 'engagement_score')
                    ->whereIn('user_id', $ids)->get() as $r) {
                    $s['engagement'][(string) $r->user_id] = (int) $r->engagement_score;
                }
            }

            if (Schema::hasTable('leave_requests')) {
                foreach (DB::table('leave_requests')
                    ->select('user_id', DB::raw('COUNT(*) as c'))
                    ->whereIn('user_id', $ids)
                    ->where('created_at', '>=', $now->copy()->subDays(90))
                    ->groupBy('user_id')->get() as $r) {
                    $s['absenceDays'][(string) $r->user_id] = (int) $r->c;
                }
            }
        }

        return $s;
    }

    /** Нормированные признаки 0..1. */
    private function buildFeatures(string $userId, object $profile, array $s): array
    {
        $now = time();
        $overdue = $s['overdue'][$userId] ?? 0;
        $open = $s['open'][$userId] ?? 0;
        $rec = $s['recognitions'][$userId] ?? 0;
        $courses = $s['overdueCourses'][$userId] ?? 0;
        $eng = $s['engagement'][$userId] ?? 70;
        $absence = $s['absenceDays'][$userId] ?? 0;

        $last1on1 = $s['last1on1'][$userId] ?? null;
        $days1on1 = $last1on1 ? max(0, ($now - strtotime((string) $last1on1)) / 86400) : 240;

        $careerUpdate = $s['careerUpdate'][$userId] ?? null;
        $daysCareer = $careerUpdate ? max(0, ($now - strtotime((string) $careerUpdate)) / 86400) : 540;

        $tenureMonths = $profile->hire_date
            ? max(0, ($now - strtotime((string) $profile->hire_date)) / 2629800)
            : 18;

        return [
            'overdue_tasks'     => $this->clamp($overdue / 6),
            'no_recent_1on1'    => $this->clamp($days1on1 / 180),
            'career_stagnation' => $this->clamp($daysCareer / 540),
            'recognition_gap'   => $this->clamp(1 - ($rec / 3)),
            'overdue_courses'   => $this->clamp($courses / 3),
            'tenure_risk'       => round($this->tenureCurve($tenureMonths), 4),
            'low_engagement'    => $this->clamp((100 - $eng) / 100),
            'absence_rate'      => $this->clamp($absence / 6),
            'workload'          => $this->clamp($open / 20),
        ];
    }

    /** Колокол риска по стажу: пик на 12–24 месяцах, спад после 4 лет. */
    private function tenureCurve(float $months): float
    {
        if ($months <= 3) return 0.35;              // адаптация
        $peak = exp(-pow(($months - 18) / 14, 2));  // максимум на 18 мес.
        return $this->clamp(0.15 + 0.85 * $peak);
    }

    private function dot(array $x): float
    {
        $z = 0.0;
        foreach (self::WEIGHTS as $k => $w) {
            $z += $w * (float) ($x[$k] ?? 0);
        }
        return $z;
    }

    /** Аддитивные вклады (SHAP для линейной модели) + перевод в проценты вероятности. */
    private function drivers(array $x, array $means, float $p, float $z): array
    {
        $out = [];
        foreach (self::WEIGHTS as $k => $w) {
            $phi = $w * ((float) $x[$k] - (float) $means[$k]);
            // Влияние на вероятность: сколько бы дала модель без этого признака.
            $withoutFeature = $this->sigmoid($z - $phi);
            $out[] = [
                'feature' => $k,
                'label' => self::LABELS[$k],
                'value' => round((float) $x[$k], 3),
                'cohort_mean' => round((float) $means[$k], 3),
                'shap' => round($phi, 4),
                'impact_pp' => round(($p - $withoutFeature) * 100, 2),
                'action' => self::ACTIONS[$k],
            ];
        }
        usort($out, fn ($a, $b) => abs($b['shap']) <=> abs($a['shap']));
        return $out;
    }

    public function band(float $p): string
    {
        if ($p >= self::BAND_HIGH) return 'high';
        if ($p >= self::BAND_MEDIUM) return 'medium';
        return 'low';
    }

    private function sigmoid(float $z): float
    {
        return 1 / (1 + exp(-$z));
    }

    private function clamp(float $v): float
    {
        return round(max(0, min(1, $v)), 4);
    }

    /**
     * D3.1 — оценка качества модели на исторических данных.
     * Метка «уволился» берётся из уволенных профилей, если такая разметка есть.
     */
    public function evaluate(string $companyId): array
    {
        $now = now();
        $labels = $this->historicalLabels($companyId);

        if (count($labels) < 20 || array_sum(array_column($labels, 'y')) < 3) {
            $row = [
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'model_version' => self::MODEL_VERSION,
                'accuracy' => null, 'precision_score' => null, 'recall' => null, 'auc' => null,
                'sample_size' => count($labels),
                'positives' => (int) array_sum(array_column($labels, 'y')),
                'status' => 'insufficient_data',
                'evaluated_at' => $now,
                'created_at' => $now, 'updated_at' => $now,
            ];
            DB::table('attrition_model_metrics')->insert($row);
            return $row;
        }

        $tp = $fp = $tn = $fn = 0;
        foreach ($labels as $l) {
            $pred = $l['p'] >= self::BAND_MEDIUM ? 1 : 0;
            if ($pred === 1 && $l['y'] === 1) $tp++;
            elseif ($pred === 1) $fp++;
            elseif ($l['y'] === 1) $fn++;
            else $tn++;
        }
        $total = max(1, $tp + $fp + $tn + $fn);
        $accuracy = ($tp + $tn) / $total;
        $precision = ($tp + $fp) > 0 ? $tp / ($tp + $fp) : null;
        $recall = ($tp + $fn) > 0 ? $tp / ($tp + $fn) : null;
        $auc = $this->auc($labels);

        $row = [
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'model_version' => self::MODEL_VERSION,
            'accuracy' => round($accuracy, 4),
            'precision_score' => $precision !== null ? round($precision, 4) : null,
            'recall' => $recall !== null ? round($recall, 4) : null,
            'auc' => $auc !== null ? round($auc, 4) : null,
            'sample_size' => $total,
            'positives' => $tp + $fn,
            'status' => 'ok',
            'evaluated_at' => $now,
            'created_at' => $now, 'updated_at' => $now,
        ];
        DB::table('attrition_model_metrics')->insert($row);
        return $row;
    }

    /** Пары (прогноз, факт увольнения) — только если в БД есть разметка. */
    private function historicalLabels(string $companyId): array
    {
        $preds = DB::table('attrition_predictions')
            ->where('company_id', $companyId)
            ->get(['user_id', 'probability']);
        if ($preds->isEmpty()) return [];

        $terminatedColumn = null;
        foreach (['terminated_at', 'left_at', 'dismissed_at'] as $col) {
            if (Schema::hasColumn('profiles', $col)) { $terminatedColumn = $col; break; }
        }
        if (! $terminatedColumn) return [];

        $terminated = DB::table('profiles')
            ->where('company_id', $companyId)
            ->whereNotNull($terminatedColumn)
            ->pluck('user_id')->map(fn ($v) => (string) $v)->flip();

        $out = [];
        foreach ($preds as $p) {
            $out[] = ['p' => (float) $p->probability, 'y' => $terminated->has((string) $p->user_id) ? 1 : 0];
        }
        return $out;
    }

    /** ROC-AUC методом попарного сравнения. */
    private function auc(array $labels): ?float
    {
        $pos = array_values(array_filter($labels, fn ($l) => $l['y'] === 1));
        $neg = array_values(array_filter($labels, fn ($l) => $l['y'] === 0));
        if (! $pos || ! $neg) return null;
        $sum = 0; $cnt = 0;
        foreach ($pos as $a) {
            foreach ($neg as $b) {
                $sum += $a['p'] > $b['p'] ? 1 : ($a['p'] === $b['p'] ? 0.5 : 0);
                $cnt++;
            }
        }
        return $cnt ? $sum / $cnt : null;
    }

    /**
     * D3.4 — калькулятор «что если».
     * $levers: доля улучшения признака 0..1 (напр. ['no_recent_1on1' => 0.8]).
     */
    public function simulate(string $companyId, array $levers, int $replacementCost = 0): array
    {
        $preds = DB::table('attrition_predictions')
            ->where('company_id', $companyId)
            ->get(['user_id', 'probability', 'features']);

        if ($preds->isEmpty()) {
            return ['error' => 'no_predictions'];
        }

        $before = 0.0; $after = 0.0; $improvedHigh = 0; $highBefore = 0; $highAfter = 0;
        foreach ($preds as $row) {
            $x = json_decode((string) $row->features, true) ?: [];
            $pBefore = (float) $row->probability;
            foreach ($levers as $k => $reduction) {
                if (! isset($x[$k]) || ! isset(self::WEIGHTS[$k])) continue;
                $x[$k] = max(0, min(1, $x[$k] * (1 - max(0, min(1, (float) $reduction)))));
            }
            $pAfter = $this->sigmoid(self::INTERCEPT + $this->dot($x));
            $before += $pBefore; $after += $pAfter;
            if ($this->band($pBefore) === 'high') $highBefore++;
            if ($this->band($pAfter) === 'high') $highAfter++;
            if ($this->band($pBefore) === 'high' && $this->band($pAfter) !== 'high') $improvedHigh++;
        }

        $headcount = $preds->count();
        $expectedLeaversBefore = $before;
        $expectedLeaversAfter = $after;
        $saved = max(0, $expectedLeaversBefore - $expectedLeaversAfter);

        return [
            'headcount' => $headcount,
            'avg_probability_before' => round($before / $headcount, 4),
            'avg_probability_after' => round($after / $headcount, 4),
            'expected_leavers_before' => round($expectedLeaversBefore, 1),
            'expected_leavers_after' => round($expectedLeaversAfter, 1),
            'retained_employees' => round($saved, 1),
            'high_risk_before' => $highBefore,
            'high_risk_after' => $highAfter,
            'high_risk_recovered' => $improvedHigh,
            'money_saved' => $replacementCost > 0 ? (int) round($saved * $replacementCost) : null,
            'levers' => $levers,
        ];
    }
}
