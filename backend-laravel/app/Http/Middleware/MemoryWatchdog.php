<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ранняя диагностика расхода памяти на /api/*.
 *
 * Фатал по memory_limit происходит вне обработчика исключений Laravel: в логе
 * остаётся только строка `api_fatal` уже по факту падения. Этот middleware
 * пишет предупреждение ЗАРАНЕЕ — как только ответ (успешный!) израсходовал
 * больше порога. Так деградация видна до того, как превратится в 500.
 */
class MemoryWatchdog
{
    /** Порог в мегабайтах, после которого запрос считаем «тяжёлым». */
    private const WARN_MB = 96;

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $peakMb = memory_get_peak_usage(true) / 1048576;
        if ($peakMb >= self::WARN_MB) {
            Log::warning('api_memory_high', [
                'uri'        => $request->getRequestUri(),
                'method'     => $request->method(),
                'user_id'    => optional($request->user())->getAuthIdentifier(),
                'status'     => $response->getStatusCode(),
                'peak_mb'    => round($peakMb, 1),
                'limit'      => ini_get('memory_limit'),
            ]);
        }

        return $response;
    }
}
