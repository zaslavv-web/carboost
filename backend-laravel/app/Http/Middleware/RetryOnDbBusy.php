<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Шаред-хостинг ограничивает число одновременных подключений MySQL
 * (`max_user_connections`, SQLSTATE HY000 / 1203). При всплеске параллельных
 * запросов фронта Laravel не может открыть соединение и отдаёт 500 —
 * пользователь видит «всё сломалось», хотя база жива.
 *
 * Middleware:
 *  1) для идемпотентных запросов (GET/HEAD) повторяет обработку с короткой
 *     паузой — почти всегда соединение освобождается за десятки миллисекунд;
 *  2) если повторы не помогли, отдаёт честный 503 c кодом `db_busy`
 *     и заголовком Retry-After вместо 500.
 */
class RetryOnDbBusy
{
    /** Коды/сигнатуры ошибок «нет свободного соединения», а не «плохой SQL». */
    private const BUSY_SIGNATURES = [
        'max_user_connections',
        'max_connections_per_hour',
        'Too many connections',
        'too many clients',
        'SQLSTATE[08006]',
        'SQLSTATE[08004]',
        'server has gone away',
        'Connection refused',
    ];

    private const MAX_ATTEMPTS = 3;

    public function handle(Request $request, Closure $next): Response
    {
        $idempotent = in_array($request->getMethod(), ['GET', 'HEAD'], true);
        $attempts = $idempotent ? self::MAX_ATTEMPTS : 1;

        for ($attempt = 1; ; $attempt++) {
            try {
                return $next($request);
            } catch (QueryException $e) {
                if (!$this->isBusy($e) || $attempt >= $attempts) {
                    if (!$this->isBusy($e)) {
                        throw $e;
                    }
                    return $this->busyResponse($request, $e);
                }

                // Освобождаем текущее (возможно, полуоткрытое) соединение и ждём.
                try {
                    DB::disconnect();
                } catch (\Throwable) {
                    // ignore
                }
                usleep(120_000 * $attempt); // 120ms, 240ms
            }
        }
    }

    private function isBusy(QueryException $e): bool
    {
        $message = $e->getMessage();
        foreach (self::BUSY_SIGNATURES as $needle) {
            if (stripos($message, $needle) !== false) {
                return true;
            }
        }
        return false;
    }

    private function busyResponse(Request $request, QueryException $e): Response
    {
        \Log::warning('db_busy: connection limit reached', [
            'path'   => $request->path(),
            'method' => $request->getMethod(),
            'reason' => substr($e->getMessage(), 0, 300),
        ]);

        return response()->json([
            'message'    => 'База данных временно перегружена. Повторите через несколько секунд.',
            'error_code' => 'db_busy',
        ], 503)->header('Retry-After', '3');
    }
}
