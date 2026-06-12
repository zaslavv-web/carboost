<?php

use App\Http\Controllers\Api\AchievementController;
use App\Http\Controllers\Api\AiController;
use App\Http\Controllers\Api\AssessmentController;
use App\Http\Controllers\Api\AssessmentScenarioController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Auth\GoogleAuthController;
use App\Http\Controllers\Api\CareerGoalController;
use App\Http\Controllers\Api\CareerTrackTemplateController;
use App\Http\Controllers\Api\ClosedQuestionTestController;
use App\Http\Controllers\Api\CompetencyController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\HrDocumentController;
use App\Http\Controllers\Api\ImpersonationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PositionCareerPathController;
use App\Http\Controllers\Api\PositionController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\SupportTicketController;
use App\Http\Controllers\Api\TeamMemberController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;
use App\Support\RuntimeEnv;

/*
| API routes (Phase 6 — full CRUD).
| Префикс /api добавляется автоматически (bootstrap/app.php).
*/

// ---- Public ----
Route::get('/health', function () {
    $checks = ['api' => 'ok'];

    try {
        DB::select('select 1');
        $checks['db'] = 'ok';
    } catch (\Throwable $e) {
        $checks['db'] = 'error: ' . $e->getMessage();
    }

    // Redis опционален: текущий деплой использует file-кеш/сессии и sync-очередь.
    // Проверяем Redis, только если cache/session/queue действительно используют redis.
    $usesRedis = in_array('redis', [
        (string) config('cache.default'),
        (string) config('session.driver'),
        (string) config('queue.default'),
    ], true);
    if ($usesRedis) {
        try {
            Redis::connection()->ping();
            $checks['redis'] = 'ok';
        } catch (\Throwable $e) {
            $checks['redis'] = 'error: ' . $e->getMessage();
        }
    } else {
        $checks['redis'] = 'skipped';
    }

    $ok = $checks['db'] === 'ok' && ($checks['redis'] === 'ok' || $checks['redis'] === 'skipped');
    return response()->json(['status' => $ok ? 'ok' : 'degraded', 'checks' => $checks], $ok ? 200 : 503);
});

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login',    [AuthController::class, 'login']);
Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);
Route::get('/auth/yandex/redirect', [\App\Http\Controllers\Api\Auth\YandexAuthController::class, 'redirect']);
Route::get('/auth/yandex/callback', [\App\Http\Controllers\Api\Auth\YandexAuthController::class, 'callback']);

// GeoIP + список доступных способов входа для текущего IP (используется на /login).
Route::get('/geo', \App\Http\Controllers\Api\GeoController::class);

// Phase 13: password reset (заменяет legacy.auth.resetPasswordForEmail/updateUser)
Route::post('/auth/forgot-password', [\App\Http\Controllers\Api\Auth\PasswordResetController::class, 'forgot']);
Route::post('/auth/reset-password',  [\App\Http\Controllers\Api\Auth\PasswordResetController::class, 'reset']);

// Public RPCs used from landing/pricing forms (declared BEFORE the auth group
// so they take precedence over the generic /rpc/{name} below).
Route::post('/rpc/submit_demo_request',    fn (\Illuminate\Http\Request $r) =>
    app(\App\Http\Controllers\Api\RpcController::class)->call($r, 'submit_demo_request'));
Route::post('/rpc/submit_pricing_inquiry', fn (\Illuminate\Http\Request $r) =>
    app(\App\Http\Controllers\Api\RpcController::class)->call($r, 'submit_pricing_inquiry'));

// Продуктовая аналитика: ingest публичный (события можно слать и без логина —
// например, с лендинга). Запросы данных закрыты ниже под auth:sanctum.
Route::post('/analytics/ingest', [\App\Http\Controllers\Api\AnalyticsController::class, 'ingest']);

// /auth/me публичный: если sanctum-токен есть и валиден — контроллер прочитает его
// через Auth::guard('sanctum')->user(); если нет — отдаст чистый 401 JSON.
// До этого роут стоял в auth:sanctum-группе и при любом сбое Sanctum (легаси-схема
// personal_access_tokens, отсутствующая колонка) возвращал 500.
Route::get('/auth/me', [AuthController::class, 'me']);

// Диагностика прод-окружения (без секретов): git-коммит, миграции, конфиг почты, OAuth.
Route::get('/diag', function () {
    $hasAssignCompanyRoute = collect(\Illuminate\Support\Facades\Route::getRoutes())->contains(
        fn ($r) => $r->uri() === 'api/admin/users/{userId}/company'
            && in_array('PATCH', $r->methods(), true),
    );

    try {
        app(\App\Services\EmailConfigService::class)->apply();
    } catch (\Throwable) {
        // Диагностика не должна падать из-за повреждённых SMTP-настроек.
    }
    $migrations = [];
    try {
        $migrations = \DB::table('migrations')->orderByDesc('id')->limit(5)->pluck('migration')->all();
    } catch (\Throwable $e) { $migrations = ['error' => $e->getMessage()]; }
    $frontendUrl = RuntimeEnv::url('FRONTEND_URL', RuntimeEnv::url('APP_FRONTEND_URL', config('app.url')));
    $googleRedirect = RuntimeEnv::url('GOOGLE_REDIRECT_URI', rtrim(RuntimeEnv::url('APP_URL', config('app.url')), '/') . '/api/auth/google/callback');
    return response()->json([
        'app_env'   => app()->environment(),
        'app_debug' => (bool) config('app.debug'),
        'php'       => PHP_VERSION,
        'laravel'   => app()->version(),
        'deploy_marker' => 'assign-company-route-probe-2026-06-05-01',
        'routes'    => [
            'has_assign_company' => $hasAssignCompanyRoute,
        ],
        'commit'    => trim(@file_get_contents(base_path('VERSION')) ?: 'unknown'),
        'mail'      => [
            'mailer'     => config('mail.default'),
            'host'       => config('mail.mailers.smtp.host'),
            'port'       => config('mail.mailers.smtp.port'),
            'encryption' => config('mail.mailers.smtp.encryption') ?: 'none',
            'username'   => config('mail.mailers.smtp.username') ? 'set' : 'missing',
            'password'   => config('mail.mailers.smtp.password') ? 'set' : 'missing',
            'from'       => config('mail.from.address'),
            'from_name'  => config('mail.from.name'),
        ],
        'google'    => [
            'client_id'     => RuntimeEnv::status('GOOGLE_CLIENT_ID'),
            'client_secret' => RuntimeEnv::status('GOOGLE_CLIENT_SECRET'),
            'redirect'      => $googleRedirect,
            'frontend_url'  => $frontendUrl,
        ],
        'migrations_tail' => $migrations,
    ]);
});

// ---- Authenticated (Sanctum token) ----
Route::middleware(['auth:sanctum', 'effective.user'])->group(function () {
    // Auth + impersonation
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/impersonation/start', [ImpersonationController::class, 'start']);
    Route::post('/impersonation/stop',  [ImpersonationController::class, 'stop']);

    // Продуктовая аналитика — отчёты доступны только суперадмину (gate + контроллер).
    Route::middleware('can:viewProductAnalytics')->group(function () {
        Route::get('/analytics/overview',      [\App\Http\Controllers\Api\AnalyticsController::class, 'overview']);
        Route::get('/analytics/events',        [\App\Http\Controllers\Api\AnalyticsController::class, 'events']);
        Route::get('/analytics/paths',         [\App\Http\Controllers\Api\AnalyticsController::class, 'paths']);
        Route::get('/analytics/problems',      [\App\Http\Controllers\Api\AnalyticsController::class, 'problems']);
        Route::get('/analytics/user-timeline', [\App\Http\Controllers\Api\AnalyticsController::class, 'userTimeline']);
        Route::get('/analytics/sessions',      [\App\Http\Controllers\Api\AnalyticsController::class, 'sessions']);
    });

    // Phase 13: admin создаёт пользователя (заменяет admin-create-user edge function)
    // redeploy marker: ensure PATCH /admin/users/{userId}/company is registered (route:cache rebuild)
    Route::post('/admin/users', [\App\Http\Controllers\Api\Admin\UsersController::class, 'store']);
    Route::post('/admin/users/{userId}/password-reset', [\App\Http\Controllers\Api\Admin\UsersController::class, 'sendPasswordReset']);
    Route::patch('/admin/users/{userId}/company', [\App\Http\Controllers\Api\Admin\UsersController::class, 'assignCompany']);
    Route::get('/admin/email-settings', [\App\Http\Controllers\Api\Admin\EmailSettingsController::class, 'index']);
    Route::put('/admin/email-settings', [\App\Http\Controllers\Api\Admin\EmailSettingsController::class, 'update']);
    Route::post('/admin/email-settings/test', [\App\Http\Controllers\Api\Admin\EmailSettingsController::class, 'test']);
    Route::post('/admin/email-settings/preflight', [\App\Http\Controllers\Api\Admin\EmailSettingsController::class, 'preflight']);
    Route::post('/admin/email-settings/activate', [\App\Http\Controllers\Api\Admin\EmailSettingsController::class, 'activate']);


    // Профиль текущего пользователя — без has.company (нужен на CompleteRegistration)
    Route::get('/profiles/me', [ProfileController::class, 'me']);

    // Публичный список компаний для CompleteRegistration: доступен любому
    // авторизованному пользователю, даже без company_id / verified.
    Route::get('/companies/public', function () {
        return \App\Models\Company::query()
            ->orderBy('name')
            ->get(['id', 'name']);
    });


    // Verified + has-company gated routes
    Route::middleware(['verified.user', 'has.company'])->group(function () {
        // Профили
        Route::get('/profiles',                  [ProfileController::class, 'index']);
        Route::get('/profiles/{id}/similar',     [\App\Http\Controllers\Api\UserInsightsController::class, 'similar']);
        Route::get('/profiles/{id}/environment', [\App\Http\Controllers\Api\UserInsightsController::class, 'environment']);
        Route::get('/profiles/{id}',             [ProfileController::class, 'show']);
        Route::patch('/profiles/{id}',           [ProfileController::class, 'update']);
        Route::post('/profiles/{id}/verify',     [ProfileController::class, 'verify']);

        // Уведомления
        Route::apiResource('notifications', NotificationController::class)->except(['update']);
        Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);

        // ---- Internal chat (Phase 14) ----
        Route::get   ('/chats',                                  [\App\Http\Controllers\Api\ChatController::class, 'index']);
        Route::post  ('/chats',                                  [\App\Http\Controllers\Api\ChatController::class, 'store']);
        Route::get   ('/chats/unread-count',                     [\App\Http\Controllers\Api\ChatController::class, 'unreadCount']);
        Route::get   ('/chats/contacts',                         [\App\Http\Controllers\Api\ChatController::class, 'contacts']);
        Route::get   ('/chats/{id}/messages',                    [\App\Http\Controllers\Api\ChatController::class, 'messages']);
        Route::post  ('/chats/{id}/messages',                    [\App\Http\Controllers\Api\ChatController::class, 'sendMessage']);
        Route::patch ('/chats/{id}/read',                        [\App\Http\Controllers\Api\ChatController::class, 'markRead']);
        Route::post  ('/chats/{id}/messages/{messageId}/reactions', [\App\Http\Controllers\Api\ChatController::class, 'toggleReaction']);

        // Справочники компании
        Route::apiResource('departments',           DepartmentController::class);
        Route::apiResource('positions',             PositionController::class);
        Route::apiResource('position-career-paths', PositionCareerPathController::class);
        Route::apiResource('hr-documents',          HrDocumentController::class);
        Route::apiResource('career-track-templates', CareerTrackTemplateController::class);
        Route::apiResource('assessment-scenarios',   AssessmentScenarioController::class);
        Route::apiResource('closed-question-tests',  ClosedQuestionTestController::class);

        // Owned by user
        Route::apiResource('achievements',  AchievementController::class);
        Route::apiResource('assessments',   AssessmentController::class);
        Route::apiResource('competencies',  CompetencyController::class);
        Route::apiResource('career-goals',  CareerGoalController::class);
        Route::apiResource('support-tickets', SupportTicketController::class);

        // Teams
        Route::apiResource('team-members', TeamMemberController::class);

        // ---- Leaves module (Iteration 1) ----
        Route::apiResource('leave-types', \App\Http\Controllers\Api\LeaveTypeController::class);
        Route::apiResource('leave-balances', \App\Http\Controllers\Api\LeaveBalanceController::class);
        Route::get   ('/leave-requests',                [\App\Http\Controllers\Api\LeaveRequestController::class, 'index']);
        Route::post  ('/leave-requests',                [\App\Http\Controllers\Api\LeaveRequestController::class, 'store']);
        Route::get   ('/leave-requests/{id}',           [\App\Http\Controllers\Api\LeaveRequestController::class, 'show']);
        Route::post  ('/leave-requests/{id}/approve',   [\App\Http\Controllers\Api\LeaveRequestController::class, 'approve']);
        Route::post  ('/leave-requests/{id}/reject',    [\App\Http\Controllers\Api\LeaveRequestController::class, 'reject']);
        Route::post  ('/leave-requests/{id}/cancel',    [\App\Http\Controllers\Api\LeaveRequestController::class, 'cancel']);
        Route::get   ('/leave-compensations',           [\App\Http\Controllers\Api\LeaveCompensationController::class, 'index']);
        Route::post  ('/leave-compensations/calculate', [\App\Http\Controllers\Api\LeaveCompensationController::class, 'calculate']);
        Route::post  ('/leave-compensations/{id}/paid', [\App\Http\Controllers\Api\LeaveCompensationController::class, 'markPaid']);

        // ---- Performance reviews module (Iteration 2) ----
        Route::get   ('/performance-cycles',                [\App\Http\Controllers\Api\PerformanceController::class, 'indexCycles']);
        Route::post  ('/performance-cycles',                [\App\Http\Controllers\Api\PerformanceController::class, 'storeCycle']);
        Route::patch ('/performance-cycles/{id}',           [\App\Http\Controllers\Api\PerformanceController::class, 'updateCycle']);
        Route::post  ('/performance-cycles/{id}/open',      [\App\Http\Controllers\Api\PerformanceController::class, 'openCycle']);
        Route::post  ('/performance-cycles/{id}/close',     [\App\Http\Controllers\Api\PerformanceController::class, 'closeCycle']);
        Route::get   ('/performance-reviews',               [\App\Http\Controllers\Api\PerformanceController::class, 'indexReviews']);
        Route::get   ('/performance-reviews/{id}',          [\App\Http\Controllers\Api\PerformanceController::class, 'showReview']);
        Route::post  ('/performance-reviews/{id}/feedback', [\App\Http\Controllers\Api\PerformanceController::class, 'submitFeedback']);
        Route::post  ('/performance-reviews/{id}/finalize', [\App\Http\Controllers\Api\PerformanceController::class, 'finalize']);

        // ---- Probation periods ----
        Route::get   ('/probations',                                       [\App\Http\Controllers\Api\ProbationController::class, 'index']);
        Route::post  ('/probations',                                       [\App\Http\Controllers\Api\ProbationController::class, 'store']);
        Route::get   ('/probations/{id}',                                  [\App\Http\Controllers\Api\ProbationController::class, 'show']);
        Route::patch ('/probations/{id}',                                  [\App\Http\Controllers\Api\ProbationController::class, 'update']);
        Route::post  ('/probations/{id}/decide',                           [\App\Http\Controllers\Api\ProbationController::class, 'decide']);
        Route::post  ('/probations/{id}/criteria',                         [\App\Http\Controllers\Api\ProbationController::class, 'addCriterion']);
        Route::post  ('/probations/{id}/criteria/{criterionId}/toggle',    [\App\Http\Controllers\Api\ProbationController::class, 'toggleCriterion']);
        Route::delete('/probations/{id}/criteria/{criterionId}',           [\App\Http\Controllers\Api\ProbationController::class, 'deleteCriterion']);

        // ---- Disciplinary records (warning/PIP/observation) ----
        Route::get   ('/disciplinary-records',                                       [\App\Http\Controllers\Api\DisciplinaryController::class, 'index']);
        Route::post  ('/disciplinary-records',                                       [\App\Http\Controllers\Api\DisciplinaryController::class, 'store']);
        Route::get   ('/disciplinary-records/{id}',                                  [\App\Http\Controllers\Api\DisciplinaryController::class, 'show']);
        Route::post  ('/disciplinary-records/{id}/close',                            [\App\Http\Controllers\Api\DisciplinaryController::class, 'close']);
        Route::post  ('/disciplinary-records/{id}/criteria',                         [\App\Http\Controllers\Api\DisciplinaryController::class, 'addCriterion']);
        Route::post  ('/disciplinary-records/{id}/criteria/{criterionId}/toggle',    [\App\Http\Controllers\Api\DisciplinaryController::class, 'toggleCriterion']);
        Route::delete('/disciplinary-records/{id}/criteria/{criterionId}',           [\App\Http\Controllers\Api\DisciplinaryController::class, 'deleteCriterion']);

        // ---- 1:1 meetings ----
        Route::get   ('/one-on-ones',      [\App\Http\Controllers\Api\OneOnOneController::class, 'index']);
        Route::post  ('/one-on-ones',      [\App\Http\Controllers\Api\OneOnOneController::class, 'store']);
        Route::patch ('/one-on-ones/{id}', [\App\Http\Controllers\Api\OneOnOneController::class, 'update']);
        Route::delete('/one-on-ones/{id}', [\App\Http\Controllers\Api\OneOnOneController::class, 'destroy']);

        // ---- AI services (Phase 7, replaces legacy Edge Functions) ----
        Route::prefix('ai')->group(function () {
            Route::post('assessment-chat',              [AiController::class, 'assessmentChat']);
            Route::post('generate-closed-test',         [AiController::class, 'generateClosedTest']);
            Route::post('generate-step-scenario',       [AiController::class, 'generateStepScenario']);
            Route::post('generate-default-track-steps', [AiController::class, 'generateDefaultTrackSteps']);
            Route::post('generate-career-paths',        [AiController::class, 'generateCareerPaths']);
            Route::post('generate-positions-from-org',  [AiController::class, 'generatePositionsFromOrg']);
            Route::post('generate-questionnaire-profile', [AiController::class, 'generateQuestionnaireProfile']);
            Route::post('suggest-ticket-fix',           [AiController::class, 'suggestTicketFix']);
            Route::post('parse-position-standards',     [AiController::class, 'parsePositionStandards']);
            Route::post('parse-hr-document',            [AiController::class, 'parseHrDocument']);
            Route::post('parse-org-structure',          [AiController::class, 'parseOrgStructure']);
            Route::post('parse-test-document',          [AiController::class, 'parseTestDocument']);
        });

        // ---- Generic CRUD bridge (Phase 10, replaces legacy.from(...)) ----
        Route::get   ('/db/{table}', [\App\Http\Controllers\Api\DbController::class, 'index']);
        Route::post  ('/db/{table}', [\App\Http\Controllers\Api\DbController::class, 'store']);
        Route::patch ('/db/{table}', [\App\Http\Controllers\Api\DbController::class, 'update']);
        Route::delete('/db/{table}', [\App\Http\Controllers\Api\DbController::class, 'destroy']);

        // ---- RPC bridge (Phase 10, replaces legacy.rpc(...)) ----
        Route::post('/rpc/{name}', [\App\Http\Controllers\Api\RpcController::class, 'call']);

        // ---- Storage bridge (Phase 11, replaces legacy.storage.from(bucket).*) ----
        Route::post  ('/storage/{bucket}/upload', [\App\Http\Controllers\Api\StorageController::class, 'upload']);
        Route::get   ('/storage/{bucket}/sign',   [\App\Http\Controllers\Api\StorageController::class, 'sign']);
        Route::delete('/storage/{bucket}',        [\App\Http\Controllers\Api\StorageController::class, 'destroy']);
    });
});


