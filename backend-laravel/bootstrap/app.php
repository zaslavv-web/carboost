<?php

/**
 * Этот файл копируется поверх стандартного bootstrap/app.php в bootstrap.sh
 * (см. конец скрипта). Регистрирует наши middleware-aliases и Sanctum.
 */

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

// Runtime-лимиты. На shared-хостинге .user.ini / .htaccess могут не применяться
// (зависит от SAPI), поэтому поднимаем память прямо из кода — это работает всегда.
if (PHP_SAPI !== 'cli') {
    $current = trim((string) ini_get('memory_limit'));
    $bytes = (function (string $v): int {
        if ($v === '' || $v === '-1') return -1;
        $unit = strtolower(substr($v, -1));
        $num = (int) $v;
        return match ($unit) {
            'g' => $num * 1024 * 1024 * 1024,
            'm' => $num * 1024 * 1024,
            'k' => $num * 1024,
            default => $num,
        };
    })($current);
    if ($bytes !== -1 && $bytes < 256 * 1024 * 1024) {
        @ini_set('memory_limit', '256M');
    }
    if ((int) ini_get('max_execution_time') > 0 && (int) ini_get('max_execution_time') < 120) {
        @set_time_limit(120);
    }
}


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

        // Ретрай + честный 503 вместо 500, когда шаред-хостинг упирается
        // в лимит одновременных подключений MySQL (max_user_connections).
        $middleware->api(prepend: [
            \App\Http\Middleware\RetryOnDbBusy::class,
        ]);


        // Доверяем заголовкам X-Forwarded-* от nginx/CDN, иначе request->ip()
        // возвращает IP внутреннего прокси (приватный) и GeoIP не работает.
        $middleware->trustProxies(
            at: '*',
            headers: \Illuminate\Http\Request::HEADER_X_FORWARDED_FOR
                | \Illuminate\Http\Request::HEADER_X_FORWARDED_HOST
                | \Illuminate\Http\Request::HEADER_X_FORWARDED_PORT
                | \Illuminate\Http\Request::HEADER_X_FORWARDED_PROTO,
        );

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

        // Лимит соединений MySQL (max_user_connections) — это перегрузка,
        // а не ошибка приложения: отдаём 503 + Retry-After, чтобы фронт
        // мог мягко повторить, а не показывать «сломано».
        $exceptions->render(function (\Illuminate\Database\QueryException $e, $request) {
            $busy = preg_match(
                '/max_user_connections|max_connections_per_hour|Too many connections|too many clients|SQLSTATE\[0800[46]\]|server has gone away/i',
                $e->getMessage(),
            );
            if ($busy && ($request->is('api/*') || $request->expectsJson())) {
                \Illuminate\Support\Facades\DB::disconnect();
                return response()->json([
                    'message'    => 'База данных временно перегружена. Повторите через несколько секунд.',
                    'error_code' => 'db_busy',
                ], 503)->header('Retry-After', '3');
            }
        });

        // Любая необработанная ошибка на /api/* получает короткий error_id.
        // Тот же error_id пишется в лог вместе с URI, пользователем и пиком
        // памяти — по скриншоту из браузера строка лога находится за один grep.
        $exceptions->render(function (\Throwable $e, $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }
            if ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface
                || $e instanceof \Illuminate\Validation\ValidationException
                || $e instanceof \Illuminate\Auth\AuthenticationException
                || $e instanceof \Illuminate\Auth\Access\AuthorizationException
                || $e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
                return null; // штатные 4xx отдаёт сам Laravel
            }

            $errorId = substr((string) \Illuminate\Support\Str::uuid(), 0, 8);

            \Illuminate\Support\Facades\Log::error('api_error', [
                'error_id'    => $errorId,
                'uri'         => $request->getRequestUri(),
                'method'      => $request->method(),
                'user_id'     => optional($request->user())->getAuthIdentifier(),
                'exception'   => get_class($e),
                'message'     => $e->getMessage(),
                'file'        => $e->getFile() . ':' . $e->getLine(),
                'peak_memory' => round(memory_get_peak_usage(true) / 1048576, 1) . 'MB',
            ]);

            return response()->json([
                'message'    => 'Внутренняя ошибка сервера. Код: ' . $errorId,
                'error_code' => 'server_error',
                'error_id'   => $errorId,
            ], 500);
        });
    })


    ->create();
