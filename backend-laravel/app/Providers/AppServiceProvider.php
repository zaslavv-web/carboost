<?php

namespace App\Providers;

use App\Services\EmailConfigService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        try {
            app(EmailConfigService::class)->apply();
        } catch (\Throwable $e) {
            Log::warning('Could not apply SMTP settings from database', ['err' => $e->getMessage()]);
        }
    }
}
