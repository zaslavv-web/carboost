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
 * больше порога.
 *
 * Важно: в логе теперь фиксируется и БАЗА — сколько памяти занято ещё до
 * работы контроллера (после загрузки фреймворка и провайдеров). Без этого
 * невозможно отличить «тяжёлый эндпоинт» от «тяжёлый старт приложения»:
 * когда даже тривиальный запрос падает на аллокации 4 КБ, виновата база,
 * а не запрос.
 */
class MemoryWatchdog
{
    /** Порог пика в мегабайтах, после которого запрос считаем «тяжёлым». */
    private const WARN_MB = 96;

    /** Порог базы: столько памяти занято ещё до контроллера. */
    private const BASELINE_WARN_MB = 48;

    public function handle(Request $request, Closure $next): Response
    {
        $bootMb  = defined('APP_BOOT_MEM') ? APP_BOOT_MEM / 1048576 : null;
        $entryMb = memory_get_usage(true) / 1048576;
        // Реальный расход PHP: на этом хостинге memory_get_usage(true)
        // округляется до кусков Zend MM по 64 МБ и сильно завышает картину.
        $entryPhpMb = memory_get_usage(false) / 1048576;

        if ($entryPhpMb >= self::BASELINE_WARN_MB) {
            Log::warning('api_memory_baseline', [
                'uri'          => $request->getRequestUri(),
                'boot_mb'      => $bootMb === null ? null : round($bootMb, 1),
                'entry_mb'     => round($entryMb, 1),
                'entry_php_mb' => round($entryPhpMb, 1),
                'limit'        => ini_get('memory_limit'),
            ]);
        }

        $response = $next($request);

        $peakMb    = memory_get_peak_usage(true) / 1048576;
        $peakPhpMb = memory_get_peak_usage(false) / 1048576;
        if ($peakPhpMb >= self::WARN_MB) {
            Log::warning('api_memory_high', [
                'uri'         => $request->getRequestUri(),
                'method'      => $request->method(),
                'user_id'     => optional($request->user())->getAuthIdentifier(),
                'status'      => $response->getStatusCode(),
                'boot_mb'     => $bootMb === null ? null : round($bootMb, 1),
                'entry_mb'    => round($entryMb, 1),
                'handler_mb'  => round($peakMb - $entryMb, 1),
                'peak_mb'     => round($peakMb, 1),
                'peak_php_mb' => round($peakPhpMb, 1),
                'limit'       => ini_get('memory_limit'),
            ]);
        }

        return $response;
    }

}
