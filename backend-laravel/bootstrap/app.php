<?php

/**
 * Этот файл копируется поверх стандартного bootstrap/app.php в bootstrap.sh
 * (см. конец скрипта). Регистрирует наши middleware-aliases и Sanctum.
 */

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withProviders([
        \App\Providers\AppServiceProvider::class,
        \App\Providers\AuthServiceProvider::class,
    ])
    ->withRouting(
        web:      __DIR__ . '/../routes/web.php',
        api:      __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        channels: __DIR__ . '/../routes/channels.php',
        health:   '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // API stateless — никаких CSRF/session кук в API-группе
        $middleware->validateCsrfTokens(except: ['api/*']);

        // API-only backend: route('login') не существует. Запрещаем Authenticate
        // middleware пытаться построить redirect URL — для API всегда отдаём JSON 401.
        $middleware->redirectGuestsTo(fn ($request) => null);

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

        // Не пытаемся редиректить на route('login') — его нет, API-only backend.
        // Возвращаем чистый 401 JSON для неавторизованных запросов.
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })
    ->create();
