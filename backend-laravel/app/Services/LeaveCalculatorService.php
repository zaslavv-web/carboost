<?php

namespace App\Services;

use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use Carbon\CarbonImmutable;

/**
 * Расчёты для модуля отсутствий: рабочие дни, оплачиваемые/неоплачиваемые
 * больничные, компенсация неиспользованного отпуска при увольнении.
 */
class LeaveCalculatorService
{
    /** Рабочие дни (без сб/вс) между датами включительно. */
    public function calculateBusinessDays(string $start, string $end): int
    {
        $from = CarbonImmutable::parse($start);
        $to   = CarbonImmutable::parse($end);
        if ($to->lessThan($from)) return 0;

        $days = 0;
        $cur  = $from;
        while ($cur->lessThanOrEqualTo($to)) {
            if (!$cur->isWeekend()) $days++;
            $cur = $cur->addDay();
        }
        return $days;
    }

    /**
     * Разделение больничных на оплачиваемые / неоплачиваемые.
     * По умолчанию: первые 30 рабочих дней в году — оплачиваемые, далее неоплачиваемые.
     */
    public function splitSickPaidUnpaid(string $userId, int $totalDays, int $paidLimitPerYear = 30): array
    {
        $usedPaid = (int) LeaveRequest::query()
            ->where('user_id', $userId)
            ->whereIn('status', ['approved', 'pending_hr'])
            ->whereYear('start_date', now()->year)
            ->whereHas('leaveType', fn ($q) => $q->where('code', 'sick_paid'))
            ->sum('paid_days');

        $remaining = max(0, $paidLimitPerYear - $usedPaid);
        $paid   = min($totalDays, $remaining);
        $unpaid = $totalDays - $paid;
        return ['paid' => $paid, 'unpaid' => $unpaid];
    }

    /**
     * Компенсация неиспользованных дней отпуска при увольнении.
     * Базовая формула: (accrued + carryover - used) * daily_rate.
     */
    public function calculateCompensation(string $userId, float $dailyRate, string $currency = 'EUR'): array
    {
        $annualType = LeaveType::query()->where('code', 'annual')->first();
        if (!$annualType) {
            return ['unused_days' => 0, 'total_amount' => 0, 'currency' => $currency];
        }
        $balance = LeaveBalance::query()
            ->where('user_id', $userId)
            ->where('leave_type_id', $annualType->id)
            ->first();
        $unused = $balance
            ? (float) $balance->accrued_days + (float) $balance->carryover_days - (float) $balance->used_days
            : 0.0;
        $unused = max(0, $unused);
        return [
            'unused_days'  => round($unused, 2),
            'daily_rate'   => $dailyRate,
            'total_amount' => round($unused * $dailyRate, 2),
            'currency'     => $currency,
        ];
    }
}
