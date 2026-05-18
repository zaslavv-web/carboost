<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\ImpersonationService;
use Closure;
use Illuminate\Http\Request;

/**
 * Если текущий Sanctum-токен содержит ability `impersonate-as:{uuid}`,
 * подменяет auth()->user() на target. Реальный actor доступен как
 * $request->attributes->get('impersonator').
 */
class EffectiveUser
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->user()?->currentAccessToken();
        $targetId = ImpersonationService::targetFromToken($token);

        if ($targetId) {
            $actor = $request->user();
            $target = User::find($targetId);
            if ($target) {
                $target->setAttribute('impersonator', $actor);
                auth()->setUser($target);
                $request->setUserResolver(fn () => $target);
                $request->attributes->set('impersonator', $actor);
            }
        }

        return $next($request);
    }
}
