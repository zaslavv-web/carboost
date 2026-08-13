<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Гарантирует, что у текущего пользователя profiles.is_verified = true.
 * Иначе — 403 с локализованным сообщением.
 *
 * Superadmin верифицирован по умолчанию (его профиль создаётся с is_verified=true),
 * поэтому для него чтения profiles/user_roles не происходит вовсе.
 *
 * Любой сбой чтения профиля (нет соединения с БД, лимит соединений, ошибка схемы)
 * не должен превращаться в голый 500: отдаём 503 db_busy — фронт умеет его
 * обрабатывать как временную деградацию, а в лог пишем причину.
 */
class EnsureVerified
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

            $verified = $user->isVerified();
        } catch (\Throwable $e) {
            Log::warning('verified.user middleware failed', [
                'path'    => $request->path(),
                'user_id' => $user->getAuthIdentifier(),
                'message' => substr($e->getMessage(), 0, 300),
            ]);
            return response()->json([
                'message'    => 'Сервис временно недоступен. Повторите через несколько секунд.',
                'error_code' => 'db_busy',
            ], 503)->header('Retry-After', '3');
        }

        if (!$verified) {
            return response()->json([
                'message' => 'Учётная запись ожидает подтверждения суперадминистратором',
                'code'    => 'pending_verification',
            ], 403);
        }

        return $next($request);
    }
}
