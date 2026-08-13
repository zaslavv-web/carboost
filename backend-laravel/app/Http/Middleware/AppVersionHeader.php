<?php

namespace App\Http\Middleware;

use App\Support\AppVersion;
use Closure;
use Illuminate\Http\Request;

/**
 * Добавляет X-App-Version ко всем API-ответам: по одному ответу видно,
 * какая ревизия бэкенда реально обслуживает запрос.
 */
class AppVersionHeader
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        try {
            if (method_exists($response, 'header')) {
                $response->header('X-App-Version', AppVersion::current());
            }
        } catch (\Throwable $e) {
            // Диагностический заголовок не должен ломать ответ.
        }

        return $response;
    }
}
