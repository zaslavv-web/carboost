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
        // Расширяем срок жизни password reset-токена: дефолт 60 мин слишком короткий
        // для писем, открываемых из мобильной почты (Yandex/Mail.ru делают предпросмотр позже).
        config(['auth.passwords.users.expire' => 180]);

        // API-only backend: route('login') отсутствует, поэтому гостевые API-запросы
        // должны получать JSON 401, а не падать на попытке построить redirect URL.
        Authenticate::redirectUsing(fn ($request) => null);

        Event::listen(MessageSending::class, [AttachMonitoringBcc::class, 'handle']);

        // Диагностика нагрузки на БД: считаем SQL-запросы на HTTP-запрос.
        // Включается точечно (SQL_QUERY_LOG=true в .env) и пишет одну строку
        // в лог на запрос — нужно, чтобы измерить эффект мемоизации прав.
        if (filter_var(RuntimeEnv::get('SQL_QUERY_LOG') ?: env('SQL_QUERY_LOG', false), FILTER_VALIDATE_BOOL)) {
            $stats = new \stdClass();
            $stats->count = 0;
            $stats->timeMs = 0.0;
            DB::listen(function ($query) use ($stats) {
                $stats->count++;
                $stats->timeMs += (float) $query->time;
            });
            app()->terminating(function () use ($stats) {
                Log::info('sql_profile', [
                    'path'    => request()->path(),
                    'user'    => optional(auth()->user())->getAuthIdentifier(),
                    'queries' => $stats->count,
                    'time_ms' => round($stats->timeMs, 1),
                ]);
            });
        }

        // Диагностика фатальных ошибок (memory_limit / max_execution_time):
        // штатный логгер Laravel такие падения пишет без маршрута, поэтому
        // невозможно понять, какой именно запрос съел память. Пишем сами.
        if (! app()->runningInConsole()) {
            register_shutdown_function(function () {
                $err = error_get_last();
                if (! $err || ! in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
                    return;
                }
                try {
                    $request = request();
                    Log::critical('fatal_request', [
                        'message'   => $err['message'],
                        'file'      => $err['file'] . ':' . $err['line'],
                        'method'    => $request?->getMethod(),
                        'uri'       => $request?->getPathInfo(),
                        'query'     => $request?->getQueryString(),
                        'user'      => optional($request?->user())->getAuthIdentifier(),
                        'peak_mb'   => round(memory_get_peak_usage(true) / 1048576, 1),
                        'limit'     => ini_get('memory_limit'),
                    ]);
                } catch (\Throwable $e) {
                    // логирование не должно ломать shutdown
                }
            });
        }


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


