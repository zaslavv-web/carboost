<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Гарантирует, что у текущего пользователя profiles.is_verified = true.
 * Иначе — 403 с локализованным сообщением.
 *
 * Применяется в routes/api.php к группам, требующим верификации
 * (всё, кроме /auth/*, /me, /companies/select, /onboarding/*).
 *
 * Superadmin верифицирован по умолчанию (его профиль создаётся с is_verified=true).
 */
class EnsureVerified
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

        if (!$user->isVerified()) {
            return response()->json([
                'message' => 'Учётная запись ожидает подтверждения суперадминистратором',
                'code'    => 'pending_verification',
            ], 403);
        }

        return $next($request);
    }
}
