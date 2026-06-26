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

        try {
            app(EmailConfigService::class)->apply();
        } catch (\Throwable $e) {
            Log::warning('Could not apply SMTP settings from database', ['err' => $e->getMessage()]);
        }
    }
}
