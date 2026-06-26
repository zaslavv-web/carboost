<?php

namespace App\Providers;

use App\Listeners\AttachMonitoringBcc;
use App\Mail\Transport\UnisenderGoTransport;
use App\Services\EmailConfigService;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ServiceProvider;


class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // API-only backend: route('login') отсутствует, поэтому гостевые API-запросы
        // должны получать JSON 401, а не падать на попытке построить redirect URL.
        Authenticate::redirectUsing(fn ($request) => null);

        Event::listen(MessageSending::class, [AttachMonitoringBcc::class, 'handle']);

        // Регистрируем кастомный HTTP-API драйвер Unisender Go как полноценный mailer.
        Mail::extend('unisender_go', function (array $config) {
            $key = $config['key'] ?? env('UNISENDER_GO_API_KEY');
            if (empty($key)) {
                throw new \RuntimeException('Unisender Go: не задан UNISENDER_GO_API_KEY.');
            }
            return new UnisenderGoTransport(
                apiKey:         $key,
                endpoint:       $config['endpoint'] ?? 'https://go1.unisender.ru/ru/transactional/api/v1/email/send.json',
                timeoutSeconds: (int) ($config['timeout'] ?? 15),
            );
        });


        try {
            app(EmailConfigService::class)->apply();
        } catch (\Throwable $e) {
            Log::warning('Could not apply SMTP settings from database', ['err' => $e->getMessage()]);
        }
    }
}
