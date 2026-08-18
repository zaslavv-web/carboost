<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Epic B3 — журнал событий безопасности + доставка в SIEM.
 * Пишет raw-инсертом, никогда не бросает исключений наружу.
 */
class SecurityAudit
{
    public static function log(array $attrs): void
    {
        try {
            if (!Schema::hasTable('security_audit_log')) return;

            $row = [
                'id'          => (string) Str::uuid(),
                'company_id'  => $attrs['company_id'] ?? null,
                'user_id'     => isset($attrs['user_id']) ? (string) $attrs['user_id'] : null,
                'actor_email' => $attrs['actor_email'] ?? null,
                'event'       => (string) ($attrs['event'] ?? 'unknown'),
                'category'    => (string) ($attrs['category'] ?? 'auth'),
                'severity'    => (string) ($attrs['severity'] ?? 'info'),
                'target_type' => $attrs['target_type'] ?? null,
                'target_id'   => isset($attrs['target_id']) ? (string) $attrs['target_id'] : null,
                'ip'          => $attrs['ip'] ?? request()?->ip(),
                'user_agent'  => Str::limit((string) ($attrs['user_agent'] ?? request()?->userAgent() ?? ''), 290, ''),
                'payload'     => isset($attrs['payload'])
                    ? json_encode($attrs['payload'], JSON_UNESCAPED_UNICODE)
                    : null,
                'created_at'  => now(),
            ];

            DB::table('security_audit_log')->insert($row);
            self::forwardToSiem($row);
        } catch (\Throwable) {
            // журнал не должен ломать бизнес-операции
        }
    }

    /** Асинхронно (fire-and-forget) отправляет событие в SIEM-вебхук компании. */
    private static function forwardToSiem(array $row): void
    {
        try {
            if (!Schema::hasTable('security_policies')) return;
            $policy = DB::table('security_policies')
                ->where('company_id', $row['company_id'])
                ->first(['siem_webhook_url', 'siem_format']);
            if (!$policy || !$policy->siem_webhook_url) return;

            $body = ($policy->siem_format === 'cef') ? ['raw' => self::toCef($row)] : $row;
            Http::timeout(3)->post($policy->siem_webhook_url, $body);
        } catch (\Throwable) {
            // сеть SIEM недоступна — событие уже сохранено локально
        }
    }

    public static function toCef(array $row): string
    {
        $sev = ['info' => 3, 'warning' => 6, 'critical' => 9][$row['severity']] ?? 3;
        return sprintf(
            'CEF:0|GrowthPeak|HRTech|1.0|%s|%s|%d|src=%s suser=%s cs1Label=category cs1=%s cs2Label=target cs2=%s end=%s',
            $row['event'],
            $row['event'],
            $sev,
            $row['ip'] ?? '-',
            $row['actor_email'] ?? '-',
            $row['category'],
            ($row['target_type'] ?? '-') . ':' . ($row['target_id'] ?? '-'),
            (string) $row['created_at'],
        );
    }
}
