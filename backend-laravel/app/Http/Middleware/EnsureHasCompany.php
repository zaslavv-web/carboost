<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Гарантирует, что у пользователя есть company_id в профиле.
 * Иначе — 403 + код, который фронт обрабатывает редиректом на /complete-registration.
 *
 * Сбой чтения профиля отдаём как 503 db_busy, а не 500: клиент трактует это
 * как временную деградацию и не разлогинивает пользователя.
 */
class EnsureHasCompany
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Не авторизован'], 401);
        }

        try {
            $impersonator = $request->attributes->get('impersonator');
            if (
                (method_exists($user, 'hasRole') && $user->hasRole('superadmin')) ||
                ($impersonator && method_exists($impersonator, 'hasRole') && $impersonator->hasRole('superadmin'))
            ) {
                return $next($request);
            }

            $companyId = $user->companyId();
        } catch (\Throwable $e) {
            Log::warning('has.company middleware failed', [
                'path'    => $request->path(),
                'user_id' => $user->getAuthIdentifier(),
                'message' => substr($e->getMessage(), 0, 300),
            ]);
            return response()->json([
                'message'    => 'Сервис временно недоступен. Повторите через несколько секунд.',
                'error_code' => 'db_busy',
            ], 503)->header('Retry-After', '3');
        }

        if (!$companyId) {
            return response()->json([
                'message' => 'Не указана компания. Завершите регистрацию.',
                'code'    => 'missing_company',
            ], 403);
        }
        return $next($request);
    }
}
