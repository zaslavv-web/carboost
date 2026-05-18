<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Гарантирует, что у пользователя есть company_id в профиле.
 * Иначе — 403 + код, который фронт обрабатывает редиректом на /complete-registration.
 */
class EnsureHasCompany
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Не авторизован'], 401);
        }
        if (method_exists($user, 'hasRole') && $user->hasRole('superadmin')) {
            return $next($request);
        }
        if (!$user->companyId()) {
            return response()->json([
                'message' => 'Не указана компания. Завершите регистрацию.',
                'code'    => 'missing_company',
            ], 403);
        }
        return $next($request);
    }
}
