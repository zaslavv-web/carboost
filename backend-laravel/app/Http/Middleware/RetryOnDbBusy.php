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
 * Не повторяет запрос внутри PHP-процесса: при исчерпанном лимите такой worker
 * только дольше остаётся занятым и усиливает очередь. Сразу отдаёт честный 503
 * c кодом `db_busy` и заголовком Retry-After вместо 500.
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

    public function handle(Request $request, Closure $next): Response
    {
        try {
            return $next($request);
        } catch (QueryException $e) {
            if (!$this->isBusy($e)) {
                throw $e;
            }

            try {
                DB::disconnect();
            } catch (\Throwable) {
                // ignore
            }

            return $this->busyResponse($request, $e);
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
