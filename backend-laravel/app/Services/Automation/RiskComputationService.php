<?php

namespace App\Services\Automation;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Предиктивный анализ рисков сотрудников.
 *
 * Сигналы (эвристики, чтобы работало без AI и без размеченных данных):
 *  + просрочки задач в трекере         → +burnout, +attrition
 *  + давно не было 1:1                  → +attrition
 *  + застой на шаге карьерного трека   → +attrition
 *  + мало peer_recognitions             → -engagement
 *  + просроченные обязательные курсы   → +burnout
 *
 * Результат пишем в employee_risk_scores. При переходе в high — рассылаем
 * уведомления линейному руководителю и всем HRD компании.
 */
class RiskComputationService
{
    public function computeForCompany(string $companyId): int
    {
        $employees = DB::table('profiles')
            ->where('company_id', $companyId)
            ->whereNotNull('user_id')
            ->get(['user_id', 'company_id', 'full_name']);

        $updated = 0;
        foreach ($employees as $e) {
            try {
                $this->computeForUser((string) $e->user_id, (string) $e->company_id, (string) ($e->full_name ?? ''));
                $updated++;
            } catch (\Throwable $err) {
                Log::warning('risk compute failed', ['user' => $e->user_id, 'err' => $err->getMessage()]);
            }
        }
        return $updated;
    }

    public function computeForUser(string $userId, string $companyId, string $fullName = ''): array
    {
        $now = now();
        $factors = [];
        $attrition = 10; $burnout = 10; $engagement = 70;

        // 1) просрочки задач (за 30 дней)
        $overdueTasks = (int) DB::table('tasks')
            ->where('assignee_id', $userId)
            ->whereNotIn('status', ['done', 'closed', 'cancelled'])
            ->whereNotNull('due_date')
            ->where('due_date', '<', $now)
            ->count();
        if ($overdueTasks > 0) {
            $burnout += min(40, $overdueTasks * 5);
            $attrition += min(20, $overdueTasks * 2);
            $factors[] = ['type' => 'overdue_tasks', 'value' => $overdueTasks, 'weight' => 'high'];
        }

        // 2) давно не было 1:1 (> 60 дней)
        $last1on1 = DB::table('one_on_ones')
            ->where(function ($q) use ($userId) {
                $q->where('employee_id', $userId)->orWhere('manager_id', $userId);
            })
            ->whereNotNull('scheduled_at')
            ->max('scheduled_at');
        if (! $last1on1 || strtotime((string) $last1on1) < strtotime('-60 days')) {
            $attrition += 15;
            $engagement -= 10;
            $factors[] = ['type' => 'no_recent_1on1', 'value' => $last1on1, 'weight' => 'medium'];
        }

        // 3) застой на карьерном треке (> 90 дней без апдейтов)
        $stalledTrack = (bool) DB::table('employee_career_assignments')
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->where('updated_at', '<', $now->copy()->subDays(90))
            ->exists();
        if ($stalledTrack) {
            $attrition += 20;
            $engagement -= 10;
            $factors[] = ['type' => 'career_track_stalled', 'weight' => 'high'];
        }

        // 4) recognition за 60 дней
        $recognitions = (int) DB::table('peer_recognitions')
            ->where('to_user_id', $userId)
            ->where('created_at', '>=', $now->copy()->subDays(60))
            ->count();
        if ($recognitions === 0) {
            $engagement -= 15;
            $factors[] = ['type' => 'no_recognition_60d', 'weight' => 'medium'];
        } else {
            $engagement += min(15, $recognitions * 3);
        }

        // 5) просроченные обязательные курсы
        $overdueCourses = (int) DB::table('enrollments')
            ->where('user_id', $userId)
            ->where('mandatory', true)
            ->where('status', '!=', 'completed')
            ->whereNotNull('due_at')
            ->where('due_at', '<', $now)
            ->count();
        if ($overdueCourses > 0) {
            $burnout += min(25, $overdueCourses * 8);
            $factors[] = ['type' => 'overdue_mandatory_courses', 'value' => $overdueCourses, 'weight' => 'medium'];
        }

        $attrition = max(0, min(100, $attrition));
        $burnout = max(0, min(100, $burnout));
        $engagement = max(0, min(100, $engagement));

        $worst = max($attrition, $burnout, 100 - $engagement);
        $level = $worst >= 70 ? 'high' : ($worst >= 40 ? 'medium' : 'low');

        $recommendations = $this->recommendations($factors, $level);

        $existing = DB::table('employee_risk_scores')->where('user_id', $userId)->first();
        $previousLevel = $existing->risk_level ?? null;

        $payload = [
            'attrition_risk' => $attrition,
            'burnout_risk' => $burnout,
            'engagement_score' => $engagement,
            'risk_level' => $level,
            'factors' => json_encode($factors, JSON_UNESCAPED_UNICODE),
            'recommendations' => json_encode($recommendations, JSON_UNESCAPED_UNICODE),
            'previous_level' => $previousLevel,
            'computed_at' => $now,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('employee_risk_scores')->where('id', $existing->id)->update($payload);
        } else {
            DB::table('employee_risk_scores')->insert(array_merge($payload, [
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'company_id' => $companyId,
                'created_at' => $now,
            ]));
        }

        // Алерт при переходе в high
        if ($level === 'high' && $previousLevel !== 'high') {
            $this->alert($userId, $companyId, $fullName, $level, $factors);
        }

        return compact('attrition', 'burnout', 'engagement', 'level', 'factors');
    }

    protected function recommendations(array $factors, string $level): array
    {
        $tips = [];
        foreach ($factors as $f) {
            switch ($f['type']) {
                case 'overdue_tasks': $tips[] = 'Пересмотреть приоритеты и нагрузку, перенести сроки или делегировать.'; break;
                case 'no_recent_1on1': $tips[] = 'Назначить 1:1 встречу в ближайшую неделю.'; break;
                case 'career_track_stalled': $tips[] = 'Обсудить карьерный план, ускорить ближайший шаг трека.'; break;
                case 'no_recognition_60d': $tips[] = 'Публично отметить успехи сотрудника, попросить коллег прислать благодарности.'; break;
                case 'overdue_mandatory_courses': $tips[] = 'Снять блокеры по обязательным курсам, перенести дедлайн.'; break;
            }
        }
        if ($level === 'high') {
            $tips[] = 'Срочно вынести разговор о благополучии сотрудника на ближайшую встречу с HR.';
        }
        return array_values(array_unique($tips));
    }

    /** Уведомить менеджера и HRD компании. */
    protected function alert(string $userId, string $companyId, string $fullName, string $level, array $factors): void
    {
        $name = $fullName ?: 'сотрудника';
        $title = "Высокий риск: $name";
        $body  = 'Сводный скоринг перешёл в high. Основные сигналы: '
            . collect($factors)->pluck('type')->take(3)->implode(', ');

        $recipients = [];

        // менеджеры из team_members
        $managerIds = DB::table('team_members')->where('employee_id', $userId)->pluck('manager_id')->all();
        foreach ($managerIds as $mid) $recipients[(string) $mid] = true;

        // все HRD компании
        $hrdIds = DB::table('user_roles as r')
            ->join('profiles as p', 'p.user_id', '=', 'r.user_id')
            ->whereIn('r.role', ['hrd', 'company_admin'])
            ->where('p.company_id', $companyId)
            ->pluck('r.user_id')->all();
        foreach ($hrdIds as $hid) $recipients[(string) $hid] = true;

        foreach (array_keys($recipients) as $rid) {
            if ($rid === $userId) continue;
            try {
                DB::table('notifications')->insert([
                    'id' => (string) Str::uuid(),
                    'user_id' => $rid,
                    'company_id' => $companyId,
                    'title' => $title,
                    'description' => $body,
                    'notification_type' => 'risk_alert',
                    'is_read' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (\Throwable $e) {
                Log::warning('risk alert notify failed', ['err' => $e->getMessage()]);
            }
        }

        DB::table('employee_risk_scores')->where('user_id', $userId)->update([
            'alerted_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
