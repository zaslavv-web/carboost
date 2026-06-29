<?php

namespace App\Providers;

use App\Listeners\AttachMonitoringBcc;
use App\Mail\Transport\UnisenderGoTransport;
use App\Models\CareerStepSubmission;
use App\Models\EmployeeQuestionnaire;
use App\Models\Profile;
use App\Services\Automation\AutomationService;
use App\Services\EmailConfigService;
use App\Support\RuntimeEnv;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\DB;
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
            $key = RuntimeEnv::get('UNISENDER_GO_API_KEY') ?: ($config['key'] ?? env('UNISENDER_GO_API_KEY'));
            if (empty($key)) {
                throw new \RuntimeException('Unisender Go: не задан UNISENDER_GO_API_KEY.');
            }
            return new UnisenderGoTransport(
                apiKey:         $key,
                endpoint:       RuntimeEnv::get('UNISENDER_GO_ENDPOINT') ?: ($config['endpoint'] ?? 'https://go2.unisender.ru/ru/transactional/api/v1/email/send.json'),
                timeoutSeconds: (int) (RuntimeEnv::get('UNISENDER_GO_TIMEOUT') ?: ($config['timeout'] ?? 15)),
            );
        });


        try {
            app(EmailConfigService::class)->apply();
        } catch (\Throwable $e) {
            Log::warning('Could not apply SMTP settings from database', ['err' => $e->getMessage()]);
        }

        // --- Автоматизации продукта ---
        // Profile: смена position_id → авто-зачисление на курсы должности.
        Profile::updated(function (Profile $profile) {
            if (! $profile->wasChanged('position_id') || empty($profile->position_id)) return;
            try {
                app(AutomationService::class)->autoEnrollByPosition((string) $profile->user_id);
            } catch (\Throwable $e) {
                Log::warning('autoEnrollByPosition failed', ['err' => $e->getMessage()]);
            }
        });

        // Questionnaire: подтверждена → подбор программы лояльности по психо-профилю + авто-зачисление.
        EmployeeQuestionnaire::updated(function (EmployeeQuestionnaire $q) {
            if (! $q->wasChanged('status') || $q->status !== 'confirmed') return;
            try {
                $svc = app(AutomationService::class);
                $svc->applyLoyaltyFromQuestionnaire((string) $q->id);
                if ($q->user_id) $svc->autoEnrollByPosition((string) $q->user_id);
            } catch (\Throwable $e) {
                Log::warning('loyalty-from-questionnaire failed', ['err' => $e->getMessage()]);
            }
        });

        // Enrollment: завершение курса → авто-награда вызывается из EnrollmentController::progress.

        // Career step submission: одобрен → авто-награда по событию track.step.approved.
        CareerStepSubmission::updated(function (CareerStepSubmission $s) {
            if (! $s->wasChanged('status') || $s->status !== 'approved' || empty($s->user_id)) return;
            try {
                app(AutomationService::class)->triggerReward(
                    'track.step.approved',
                    (string) $s->user_id,
                    $s->company_id ? (string) $s->company_id : null,
                    ['reference_id' => (string) $s->id, 'description' => 'Шаг карьерного трека одобрен']
                );
            } catch (\Throwable $e) {
                Log::warning('track.step reward failed', ['err' => $e->getMessage()]);
            }
        });
    }
}


