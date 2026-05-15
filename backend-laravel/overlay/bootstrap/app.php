<?php

/**
 * Этот файл копируется поверх стандартного bootstrap/app.php в bootstrap.sh
 * (см. конец скрипта). Регистрирует наши middleware-aliases и Sanctum.
 */

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web:      __DIR__ . '/../routes/web.php',
        api:      __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health:   '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // API stateless — никаких CSRF/session кук в API-группе
        $middleware->statefulApi();

        $middleware->alias([
            'verified.user'  => \App\Http\Middleware\EnsureVerified::class,
            'has.company'    => \App\Http\Middleware\EnsureHasCompany::class,
            'effective.user' => \App\Http\Middleware\EffectiveUser::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // JSON-ответы для API
        $exceptions->shouldRenderJsonWhen(function ($request) {
            return $request->is('api/*') || $request->expectsJson();
        });
    })
    ->create();
