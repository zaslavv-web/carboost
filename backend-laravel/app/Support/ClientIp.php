<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Достаёт реальный публичный IP клиента, учитывая прокси/CDN.
 *
 * Приоритет: CF-Connecting-IP → X-Forwarded-For (первый публичный) → X-Real-IP → REMOTE_ADDR.
 */
class ClientIp
{
    public static function resolve(Request $request): ?string
    {
        $cf = trim((string) $request->headers->get('CF-Connecting-IP', ''));
        if ($cf !== '' && filter_var($cf, FILTER_VALIDATE_IP)) {
            return $cf;
        }

        $xff = (string) $request->headers->get('X-Forwarded-For', '');
        if ($xff !== '') {
            foreach (explode(',', $xff) as $part) {
                $ip = trim($part);
                if (!filter_var($ip, FILTER_VALIDATE_IP)) continue;
                if (self::isPublic($ip)) return $ip;
            }
            // fallback — первый валидный
            foreach (explode(',', $xff) as $part) {
                $ip = trim($part);
                if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
            }
        }

        $xr = trim((string) $request->headers->get('X-Real-IP', ''));
        if ($xr !== '' && filter_var($xr, FILTER_VALIDATE_IP)) {
            return $xr;
        }

        return $request->ip();
    }

    public static function isPublic(string $ip): bool
    {
        return (bool) filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        );
    }
}
