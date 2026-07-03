<?php

namespace App\Services\Automation;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Predictive Comfort Analytics (Волна 7).
 *
 * Считает три суб-скоринга на пользователе и агрегирует до отдела и компании:
 *   - ToV (0.3): чаты + магазин мотиваций + peer_recognitions
 *   - KPI (0.4): tasks + leaves + no-1:1 + инициативы
 *   - Career (0.3): прогресс по треку и динамика достижений
 *
 * comfort_index = 0.3*ToV + 0.4*KPI + 0.3*Career (0..100). Больше — лучше.
 * risk_level: >=75 low, 55..74 medium, 40..54 high, <40 critical.
 *
 * AI-классификатор тональности — опционально: подключается через ai_settings
 * (см. AiSettingsResolver), если провайдер задан. Без AI сервис работает на эвристиках.
 */
class ComfortAnalysisService
{
    private const W_TOV = 0.3;
    private const W_KPI = 0.4;
    private const W_CAR = 0.3;

    public function computeForCompany(string $companyId): array
    {
        $period = $this->currentPeriod();
        $employees = DB::table('profiles')
            ->where('company_id', $companyId)
            ->whereNotNull('user_id')
            ->pluck('user_id')->all();

        $userStats = [];
        foreach ($employees as $uid) {
            try {
                $userStats[$uid] = $this->computeForUser((string) $uid, $companyId, $period);
            } catch (\Throwable $e) {
                Log::warning('comfort compute failed', ['user' => $uid, 'err' => $e->getMessage()]);
            }
        }

        // Агрегация по отделам
        $deptMap = DB::table('profiles')
            ->where('company_id', $companyId)
            ->whereNotNull('user_id')
            ->select('user_id', 'department')
            ->get()
            ->groupBy(fn ($r) => $r->department ?: '—');

        $deptSummaries = [];
        foreach ($deptMap as $dept => $rows) {
            $ids = $rows->pluck('user_id')->all();
            $sub = array_intersect_key($userStats, array_flip($ids));
            if (! $sub) continue;
            $deptSummaries[$dept] = $this->aggregate($sub);
            $this->persistScope($companyId, 'department', $this->deptIdBySlug($companyId, (string) $dept), $deptSummaries[$dept], $period);
        }

        // Агрегация по компании
        $companySummary = $userStats ? $this->aggregate($userStats) : $this->emptySummary();
        $this->persistScope($companyId, 'company', null, $companySummary, $period);

        return [
            'users' => count($userStats),
            'departments' => count($deptSummaries),
            'company_index' => $companySummary['comfort_index'],
        ];
    }

    public function computeForUser(string $userId, string $companyId, ?array $period = null): array
    {
        $period ??= $this->currentPeriod();
        [$start, $end] = [$period['start'], $period['end']];

        $factors = [];
        $signals = [];

        // ---- ToV ----
        $tov = 70;

        // тишина в чате (участник за 30 дней написал < 3 сообщений)
        $chatMessages = (int) DB::table('chat_messages')
            ->where('sender_id', $userId)
            ->where('created_at', '>=', $end->copy()->subDays(30))
            ->count();
        if ($chatMessages < 3) {
            $tov -= 15; $factors[] = ['type' => 'tov.chat_silence', 'value' => $chatMessages, 'weight' => 'medium'];
            $signals[] = ['t' => 'tov.chat_silence', 'src' => 'chat', 'v' => $chatMessages, 'p' => 'neg', 'w' => 2];
        } elseif ($chatMessages > 30) {
            $tov += 5;
            $signals[] = ['t' => 'tov.chat_active', 'src' => 'chat', 'v' => $chatMessages, 'p' => 'pos', 'w' => 1];
        }

        // капс/восклицания (эвристика)
        if (DB::getSchemaBuilder()->hasTable('chat_messages')) {
            $harsh = (int) DB::table('chat_messages')
                ->where('sender_id', $userId)
                ->where('created_at', '>=', $end->copy()->subDays(30))
                ->whereRaw("(body ~ '[!]{2,}' OR (length(body) > 8 AND body = upper(body)))")
                ->count();
            if ($harsh >= 3) {
                $tov -= min(15, $harsh);
                $factors[] = ['type' => 'tov.harsh_tone', 'value' => $harsh, 'weight' => 'medium'];
                $signals[] = ['t' => 'tov.harsh_tone', 'src' => 'chat', 'v' => $harsh, 'p' => 'neg', 'w' => 2];
            }
        }

        // recognition (положительный сигнал)
        $recogIn = (int) DB::table('peer_recognitions')
            ->where('to_user_id', $userId)
            ->where('created_at', '>=', $end->copy()->subDays(60))
            ->count();
        $recogOut = (int) DB::table('peer_recognitions')
            ->where('from_user_id', $userId)
            ->where('created_at', '>=', $end->copy()->subDays(60))
            ->count();
        if ($recogIn === 0 && $recogOut === 0) {
            $tov -= 10;
            $factors[] = ['type' => 'tov.no_recognition', 'weight' => 'medium'];
            $signals[] = ['t' => 'tov.no_recognition', 'src' => 'shop', 'v' => 0, 'p' => 'neg', 'w' => 1];
        } else {
            $tov += min(15, ($recogIn + $recogOut) * 2);
            $signals[] = ['t' => 'tov.recognition_active', 'src' => 'shop', 'v' => $recogIn + $recogOut, 'p' => 'pos', 'w' => 1];
        }

        // активность в магазине мотиваций
        if (DB::getSchemaBuilder()->hasTable('shop_orders')) {
            $orders = (int) DB::table('shop_orders')
                ->where('user_id', $userId)
                ->where('created_at', '>=', $end->copy()->subDays(90))
                ->count();
            if ($orders > 0) {
                $tov += 3;
                $signals[] = ['t' => 'tov.shop_active', 'src' => 'shop', 'v' => $orders, 'p' => 'pos', 'w' => 1];
            }
        }

        // ---- KPI ----
        $kpi = 70;

        // задачи: доля закрытых в срок за 90 дней
        $tasksClosed = (int) DB::table('tasks')
            ->where('assignee_id', $userId)
            ->whereIn('status', ['done', 'closed'])
            ->where('updated_at', '>=', $end->copy()->subDays(90))
            ->count();
        $tasksOverdue = (int) DB::table('tasks')
            ->where('assignee_id', $userId)
            ->whereNotIn('status', ['done', 'closed', 'cancelled'])
            ->whereNotNull('due_date')
            ->where('due_date', '<', $end)
            ->count();
        if ($tasksOverdue > 0) {
            $kpi -= min(35, $tasksOverdue * 4);
            $factors[] = ['type' => 'kpi.overdue_tasks', 'value' => $tasksOverdue, 'weight' => 'high'];
            $signals[] = ['t' => 'kpi.overdue_tasks', 'src' => 'tasks', 'v' => $tasksOverdue, 'p' => 'neg', 'w' => 3];
        }
        if ($tasksClosed > 0) {
            $kpi += min(15, $tasksClosed);
            $signals[] = ['t' => 'kpi.tasks_closed', 'src' => 'tasks', 'v' => $tasksClosed, 'p' => 'pos', 'w' => 2];
        }

        // отсутствия за 90 дней
        if (DB::getSchemaBuilder()->hasTable('leave_requests')) {
            $absDays = (int) DB::table('leave_requests')
                ->where('user_id', $userId)
                ->where('status', 'approved')
                ->where('start_date', '>=', $end->copy()->subDays(90)->toDateString())
                ->sum('business_days');
            if ($absDays > 15) {
                $kpi -= min(10, ($absDays - 15));
                $factors[] = ['type' => 'kpi.absences', 'value' => $absDays, 'weight' => 'low'];
                $signals[] = ['t' => 'kpi.absences', 'src' => 'leaves', 'v' => $absDays, 'p' => 'neg', 'w' => 1];
            }
        }

        // no-1:1 за 60 дней
        $last1on1 = DB::table('one_on_ones')
            ->where(function ($q) use ($userId) {
                $q->where('employee_id', $userId)->orWhere('manager_id', $userId);
            })
            ->whereNotNull('scheduled_at')
            ->max('scheduled_at');
        if (! $last1on1 || strtotime((string) $last1on1) < strtotime('-60 days')) {
            $kpi -= 8;
            $factors[] = ['type' => 'kpi.no_1on1', 'weight' => 'medium'];
            $signals[] = ['t' => 'kpi.no_1on1', 'src' => 'tasks', 'v' => 0, 'p' => 'neg', 'w' => 2];
        }

        // инициативы (продуктовые предложения)
        if (DB::getSchemaBuilder()->hasTable('initiatives')) {
            $init = (int) DB::table('initiatives')
                ->where('author_id', $userId)
                ->where('created_at', '>=', $end->copy()->subDays(90))
                ->count();
            $accepted = (int) DB::table('initiatives')
                ->where('author_id', $userId)
                ->whereIn('status', ['accepted', 'done'])
                ->where('reviewed_at', '>=', $end->copy()->subDays(180))
                ->count();
            if ($init > 0) {
                $kpi += min(10, $init * 2 + $accepted * 3);
                $signals[] = ['t' => 'kpi.initiatives', 'src' => 'initiatives', 'v' => $init, 'p' => 'pos', 'w' => 2];
            }
        }

        // ---- Career ----
        $car = 65;
        $assign = DB::table('employee_career_assignments')
            ->where('user_id', $userId)
            ->orderByDesc('updated_at')
            ->first();
        if ($assign) {
            $stalledDays = Carbon::parse($assign->updated_at)->diffInDays($end);
            if ($stalledDays > 90) {
                $car -= min(30, ($stalledDays - 90) / 3);
                $factors[] = ['type' => 'career.stalled', 'value' => $stalledDays, 'weight' => 'high'];
                $signals[] = ['t' => 'career.stalled', 'src' => 'career', 'v' => $stalledDays, 'p' => 'neg', 'w' => 3];
            } else {
                $car += 10;
                $signals[] = ['t' => 'career.progressing', 'src' => 'career', 'v' => $stalledDays, 'p' => 'pos', 'w' => 2];
            }
        } else {
            $car -= 5;
            $factors[] = ['type' => 'career.no_track', 'weight' => 'low'];
        }
        // достижения
        if (DB::getSchemaBuilder()->hasTable('career_step_submissions')) {
            $recentSub = (int) DB::table('career_step_submissions')
                ->where('user_id', $userId)
                ->where('created_at', '>=', $end->copy()->subDays(90))
                ->count();
            $prevSub = (int) DB::table('career_step_submissions')
                ->where('user_id', $userId)
                ->whereBetween('created_at', [$end->copy()->subDays(180), $end->copy()->subDays(90)])
                ->count();
            if ($recentSub > $prevSub && $recentSub > 0) {
                $car += 8;
                $signals[] = ['t' => 'career.momentum_up', 'src' => 'career', 'v' => $recentSub, 'p' => 'pos', 'w' => 2];
            } elseif ($recentSub < $prevSub && $prevSub > 0) {
                $car -= 8;
                $signals[] = ['t' => 'career.momentum_down', 'src' => 'career', 'v' => $recentSub, 'p' => 'neg', 'w' => 2];
            }
        }

        // clamp
        $tov = max(0, min(100, (int) round($tov)));
        $kpi = max(0, min(100, (int) round($kpi)));
        $car = max(0, min(100, (int) round($car)));
        $comfort = (int) round(self::W_TOV * $tov + self::W_KPI * $kpi + self::W_CAR * $car);
        $risk = $this->levelFor($comfort);

        // Trend vs предыдущий период
        $prev = DB::table('comfort_scores')
            ->where('scope', 'user')
            ->where('scope_id', $userId)
            ->orderByDesc('period_start')
            ->first();
        $delta = $prev ? ($comfort - (int) $prev->comfort_index) : 0;
        $trend = $delta > 3 ? 'up' : ($delta < -3 ? 'down' : 'flat');

        $recommendations = $this->recommendations($factors, $risk);

        $summary = [
            'tov_score' => $tov,
            'kpi_score' => $kpi,
            'career_score' => $car,
            'comfort_index' => $comfort,
            'risk_level' => $risk,
            'trend' => $trend,
            'trend_delta' => $delta,
            'factors' => $factors,
            'recommendations' => $recommendations,
        ];

        $this->persistScope($companyId, 'user', $userId, $summary, $period);

        // сигнальные события (только новые в этом периоде)
        DB::table('comfort_signal_events')
            ->where('user_id', $userId)
            ->where('occurred_at', '>=', $period['start'])
            ->delete();
        $now = now();
        foreach ($signals as $s) {
            DB::table('comfort_signal_events')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'company_id' => $companyId,
                'signal_type' => $s['t'],
                'source' => $s['src'],
                'weight' => $s['w'],
                'value' => $s['v'],
                'polarity' => $s['p'],
                'occurred_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        return $summary;
    }

    private function aggregate(array $userStats): array
    {
        $n = count($userStats);
        if (! $n) return $this->emptySummary();
        $sum = ['tov' => 0, 'kpi' => 0, 'car' => 0, 'idx' => 0];
        $critical = 0; $high = 0;
        foreach ($userStats as $s) {
            $sum['tov'] += $s['tov_score'];
            $sum['kpi'] += $s['kpi_score'];
            $sum['car'] += $s['career_score'];
            $sum['idx'] += $s['comfort_index'];
            if ($s['risk_level'] === 'critical') $critical++;
            if ($s['risk_level'] === 'high') $high++;
        }
        $comfort = (int) round($sum['idx'] / $n);
        return [
            'tov_score' => (int) round($sum['tov'] / $n),
            'kpi_score' => (int) round($sum['kpi'] / $n),
            'career_score' => (int) round($sum['car'] / $n),
            'comfort_index' => $comfort,
            'risk_level' => $this->levelFor($comfort),
            'trend' => 'flat',
            'trend_delta' => 0,
            'factors' => [
                ['type' => 'agg.critical_share', 'value' => $critical],
                ['type' => 'agg.high_share', 'value' => $high],
                ['type' => 'agg.employees', 'value' => $n],
            ],
            'recommendations' => $critical > 0
                ? ['Разобрать индивидуально сотрудников в критической зоне.']
                : ['Поддерживать текущую практику 1:1 и признания.'],
        ];
    }

    private function emptySummary(): array
    {
        return [
            'tov_score' => 50, 'kpi_score' => 50, 'career_score' => 50,
            'comfort_index' => 50, 'risk_level' => 'low', 'trend' => 'flat',
            'trend_delta' => 0, 'factors' => [], 'recommendations' => [],
        ];
    }

    private function persistScope(string $companyId, string $scope, ?string $scopeId, array $summary, array $period): void
    {
        $now = now();
        $existing = DB::table('comfort_scores')
            ->where('company_id', $companyId)
            ->where('scope', $scope)
            ->where(function ($q) use ($scopeId) {
                $scopeId === null ? $q->whereNull('scope_id') : $q->where('scope_id', $scopeId);
            })
            ->where('period_start', $period['start']->toDateString())
            ->first();

        $payload = [
            'company_id' => $companyId,
            'scope' => $scope,
            'scope_id' => $scopeId,
            'tov_score' => $summary['tov_score'],
            'kpi_score' => $summary['kpi_score'],
            'career_score' => $summary['career_score'],
            'comfort_index' => $summary['comfort_index'],
            'risk_level' => $summary['risk_level'],
            'trend' => $summary['trend'],
            'trend_delta' => $summary['trend_delta'],
            'factors' => json_encode($summary['factors'], JSON_UNESCAPED_UNICODE),
            'recommendations' => json_encode($summary['recommendations'], JSON_UNESCAPED_UNICODE),
            'period_start' => $period['start']->toDateString(),
            'period_end' => $period['end']->toDateString(),
            'computed_at' => $now,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('comfort_scores')->where('id', $existing->id)->update($payload);
        } else {
            $payload['id'] = (string) Str::uuid();
            $payload['created_at'] = $now;
            DB::table('comfort_scores')->insert($payload);
        }
    }

    private function levelFor(int $idx): string
    {
        if ($idx >= 75) return 'low';
        if ($idx >= 55) return 'medium';
        if ($idx >= 40) return 'high';
        return 'critical';
    }

    private function recommendations(array $factors, string $level): array
    {
        $tips = [];
        foreach ($factors as $f) {
            switch ($f['type']) {
                case 'tov.chat_silence': $tips[] = 'Вовлечь сотрудника в командные чаты, задать открытый вопрос в 1:1.'; break;
                case 'tov.harsh_tone': $tips[] = 'Обсудить культуру общения на ближайшем 1:1.'; break;
                case 'tov.no_recognition': $tips[] = 'Дать публичное признание за последнюю задачу.'; break;
                case 'kpi.overdue_tasks': $tips[] = 'Пересмотреть приоритеты и сроки, перераспределить нагрузку.'; break;
                case 'kpi.no_1on1': $tips[] = 'Назначить 1:1 в ближайшие 7 дней.'; break;
                case 'kpi.absences': $tips[] = 'Проверить причины отсутствий, оценить риск выгорания.'; break;
                case 'career.stalled': $tips[] = 'Актуализировать карьерный трек и назначить ближайший шаг.'; break;
                case 'career.no_track': $tips[] = 'Назначить карьерный трек по позиции.'; break;
            }
        }
        if ($level === 'critical') $tips[] = 'Срочно вынести кейс на HR-комитет.';
        return array_values(array_unique($tips));
    }

    private function deptIdBySlug(string $companyId, string $deptName): ?string
    {
        if ($deptName === '—' || $deptName === '') return null;
        return DB::table('departments')
            ->where('company_id', $companyId)
            ->where('name', $deptName)
            ->value('id');
    }

    private function currentPeriod(): array
    {
        return [
            'start' => Carbon::now()->startOfMonth(),
            'end' => Carbon::now(),
        ];
    }
}
