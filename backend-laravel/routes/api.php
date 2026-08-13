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

    // Память ВЕБ-процесса. CLI (`php artisan diag:memory`) видит другой php.ini
    // и другой набор загруженного кода, поэтому его 12 МБ ничего не говорят о
    // том, почему запрос в вебе упирается в 256 МБ. Эти поля — база веба.
    $checks['memory_limit'] = ini_get('memory_limit');
    $checks['sapi']         = PHP_SAPI;
    $checks['boot_mb']      = defined('APP_BOOT_MEM') ? round(APP_BOOT_MEM / 1048576, 1) : null;
    $checks['usage_mb']     = round(memory_get_usage(true) / 1048576, 1);
    $checks['peak_mb']      = round(memory_get_peak_usage(true) / 1048576, 1);
    // Честный расход без округления до куска Zend MM. Если usage_mb (real)
    // кратно 64, а usage_php — единицы мегабайт, значит память «квантуется»
    // кусками по 64 МБ, и лимит надо держать заметно выше расхода.
    $checks['usage_php_mb'] = round(memory_get_usage(false) / 1048576, 1);
    $checks['peak_php_mb']  = round(memory_get_peak_usage(false) / 1048576, 1);
    // APP_DEBUG в проде — частая причина взрывного расхода памяти: Laravel
    // начинает собирать полные трейсы с объектами и рендерить Ignition.
    $checks['app_debug']    = (bool) config('app.debug');
    $checks['opcache']      = function_exists('opcache_get_status') && @opcache_get_status(false) ? 'on' : 'off';
    // Маркер версии. VERSION пишет CI; при ручном git pull файла нет — тогда
    // берём хэш последнего коммита, иначе не отличить «код не выкатился» от
    // «код выкатился, но падает». Значение кэшируем на 5 минут: git — процесс.
    $checks['version'] = trim((string) @file_get_contents(base_path('VERSION'))) ?: (function () {
        try {
            return \Illuminate\Support\Facades\Cache::remember('app_git_version', 300, function () {
                $head = @file_get_contents(base_path('.git/HEAD'));
                if (!$head) {
                    return 'unknown';
                }
                if (preg_match('/^ref:\s*(\S+)/', $head, $m)) {
                    $sha = @file_get_contents(base_path('.git/' . $m[1]));
                    if (!$sha) {
                        // packed-refs (после clone --depth или gc)
                        $packed = @file_get_contents(base_path('.git/packed-refs')) ?: '';
                        if (preg_match('/^([0-9a-f]{40})\s+' . preg_quote($m[1], '/') . '$/m', $packed, $p)) {
                            $sha = $p[1];
                        }
                    }
                } else {
                    $sha = $head;
                }
                $sha = trim((string) $sha);
                return $sha ? substr($sha, 0, 7) : 'unknown';
            });
        } catch (\Throwable $e) {
            return 'unknown';
        }
    })();
    $checks['db_read_path'] = 'raw-chunked-v3';

    // Сводка по фаталам за последний час — чтобы проверять состояние одной
    // командой, без grep по laravel.log. Файл пишет shutdown-обработчик.
    $checks['fatals_last_hour'] = 0;
    $checks['fatals_last_uri']  = null;
    $fatalsFile = storage_path('logs/api-fatals.log');
    if (is_readable($fatalsFile)) {
        $since = time() - 3600;
        // Читаем только хвост файла: строки короткие, 64 КБ хватает на сотни падений.
        $size = @filesize($fatalsFile) ?: 0;
        $fh   = @fopen($fatalsFile, 'rb');
        if ($fh) {
            if ($size > 65536) {
                fseek($fh, -65536, SEEK_END);
                fgets($fh); // отбрасываем возможную обрезанную строку
            }
            while (($row = fgets($fh)) !== false) {
                $parts = explode(' ', trim($row), 2);
                if ((int) ($parts[0] ?? 0) >= $since) {
                    $checks['fatals_last_hour']++;
                    $checks['fatals_last_uri'] = $parts[1] ?? null;
                }
            }
            fclose($fh);
        }
    }

    // Приблизительные размеры ключевых таблиц — чтобы отличить "запрос тяжёлый"
    // от "в таблице миллионы строк и нет индекса по company_id".
    $checks['table_counts'] = [];
    try {
        $tables = [
            'users', 'profiles', 'positions', 'companies', 'departments',
            'tracker_tasks', 'chats', 'chat_messages', 'hr_documents',
            'career_track_templates', 'peer_recognitions', 'ai_usage_log',
            'support_tickets', 'notifications', 'pulse_surveys', 'pulse_survey_responses',
        ];
        // MySQL 8 отдаёт колонки information_schema в ВЕРХНЕМ регистре
        // (TABLE_NAME), MariaDB — в нижнем. Явные алиасы убирают эту разницу.
        $rows = DB::select(
            "SELECT table_name AS tname, table_rows AS trows
             FROM information_schema.tables
             WHERE table_schema = DATABASE()
               AND table_name IN ('" . implode("','", $tables) . "')"
        );
        foreach ($rows as $r) {
            $arr = array_change_key_case((array) $r, CASE_LOWER);
            if (!empty($arr['tname'])) {
                $checks['table_counts'][$arr['tname']] = (int) ($arr['trows'] ?? 0);
            }
        }
    } catch (\Throwable $e) {
        $checks['table_counts'] = ['error' => $e->getMessage()];
    }

    $ok = $checks['db'] === 'ok' && ($checks['redis'] === 'ok' || $checks['redis'] === 'skipped');
    return response()->json(['status' => $ok ? 'ok' : 'degraded', 'checks' => $checks], $ok ? 200 : 503);
});


// Аудит 2026-07-01: добавлен throttle на все публичные endpoint'ы (брутфорс/спам).
// 10/min на auth-эндпоинты — с учётом IP и логина; 30/min на публичные RPC и ingest.
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login',    [AuthController::class, 'login']);
    Route::post('/auth/forgot-password', [\App\Http\Controllers\Api\Auth\PasswordResetController::class, 'forgot']);
    Route::post('/auth/reset-password',  [\App\Http\Controllers\Api\Auth\PasswordResetController::class, 'reset']);
});

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);
Route::get('/auth/yandex/redirect', [\App\Http\Controllers\Api\Auth\YandexAuthController::class, 'redirect']);
Route::get('/auth/yandex/callback', [\App\Http\Controllers\Api\Auth\YandexAuthController::class, 'callback']);

// GeoIP + список доступных способов входа для текущего IP (используется на /login).
Route::get('/geo', \App\Http\Controllers\Api\GeoController::class);

// Public RPCs used from landing/pricing forms (declared BEFORE the auth group
// so they take precedence over the generic /rpc/{name} below).
Route::middleware('throttle:30,1')->group(function () {
    Route::post('/rpc/submit_demo_request',    fn (\Illuminate\Http\Request $r) =>
        app(\App\Http\Controllers\Api\RpcController::class)->call($r, 'submit_demo_request'));
    Route::post('/rpc/submit_pricing_inquiry', fn (\Illuminate\Http\Request $r) =>
        app(\App\Http\Controllers\Api\RpcController::class)->call($r, 'submit_pricing_inquiry'));

    // Регистрация новой компании самим HRD на форме /login → выполняется ДО signUp
    // (фронт получает company_id, затем создаёт auth-пользователя с этим company_id).
    // SQL-функция register_company валидирует длину/уникальность имени, throttle защищает от спама.
    Route::post('/rpc/register_company', fn (\Illuminate\Http\Request $r) =>
        app(\App\Http\Controllers\Api\RpcController::class)->call($r, 'register_company'));

    // find_company_by_name используется при регистрации не-HRD пользователей (сотрудник/руководитель
    // указывают существующую компанию до создания auth-аккаунта). Тоже должен быть публичным.
    Route::post('/rpc/find_company_by_name', fn (\Illuminate\Http\Request $r) =>
        app(\App\Http\Controllers\Api\RpcController::class)->call($r, 'find_company_by_name'));

    // Продуктовая аналитика: ingest публичный (события можно слать и без логина —
    // например, с лендинга). Запросы данных закрыты ниже под auth:sanctum.
    Route::post('/analytics/ingest', [\App\Http\Controllers\Api\AnalyticsController::class, 'ingest']);
});

// Wave 6: публичный iCal (HMAC-подпись в query) — для подписки Google/Outlook/Apple.
Route::get('/ical/leaves/{companyId}.ics', [\App\Http\Controllers\Api\IcalController::class, 'leaves']);


// /auth/me публичный: если sanctum-токен есть и валиден — контроллер прочитает его
// через Auth::guard('sanctum')->user(); если нет — отдаст чистый 401 JSON.
// До этого роут стоял в auth:sanctum-группе и при любом сбое Sanctum (легаси-схема
// personal_access_tokens, отсутствующая колонка) возвращал 500.
Route::get('/auth/me', [AuthController::class, 'me']);

// Диагностика прод-окружения (без секретов): git-коммит, миграции, конфиг почты, OAuth.
// Доступ только superadmin/company_admin (через auth:sanctum + role check).
Route::middleware(['auth:sanctum'])->get('/diag', function () {
    $user = auth()->user();
    if (!$user || !($user->hasRole('superadmin') || $user->hasRole('company_admin'))) {
        return response()->json(['error' => 'Forbidden'], 403);
    }
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
    Route::delete('/admin/email-settings', [\App\Http\Controllers\Api\Admin\EmailSettingsController::class, 'clear']);

    // Superadmin: демо-компания «ООО Демо» (наполнение и сброс)
    Route::get('/superadmin/demo/status', [\App\Http\Controllers\Api\Admin\DemoSeedController::class, 'status']);
    Route::post('/superadmin/demo/seed',  [\App\Http\Controllers\Api\Admin\DemoSeedController::class, 'seed']);
    Route::post('/superadmin/demo/reset', [\App\Http\Controllers\Api\Admin\DemoSeedController::class, 'reset']);


    // Профиль текущего пользователя — без has.company (нужен на CompleteRegistration)
    Route::get('/profiles/me', [ProfileController::class, 'me']);

    // Счётчик непрочитанных сообщений — фоновый бейдж на каждой странице.
    // Держим его вне verified/has.company: он не отдаёт данных компании,
    // а гейт добавлял два чтения профиля (+SHOW COLUMNS) на каждый вызов
    // и был единственным местом, где запрос падал в 500 до контроллера.
    Route::get('/chats/unread-count', [\App\Http\Controllers\Api\ChatController::class, 'unreadCount']);

    // Owner-only лёгкие чтения для оболочки сотрудника. Проверка профиля
    // выполняется одним запросом внутри контроллера, без generic CRUD/schema path.
    Route::get('/employee/today', [\App\Http\Controllers\Api\EmployeeReadController::class, 'today']);
    Route::get('/employee/tasks', [\App\Http\Controllers\Api\EmployeeReadController::class, 'tasks']);
    Route::get('/employee/notifications', [\App\Http\Controllers\Api\EmployeeReadController::class, 'notifications']);

    // Диагностика памяти ВНУТРИ настоящего HTTP-запроса (не CLI): показывает,
    // сколько занято на входе в маршрут, после резолва пользователя Sanctum,
    // после чтения профиля и после того самого запроса unread-count.
    // Возвращает только цифры — ни данных компании, ни секретов.
    Route::get('/diag/request-memory', function (\Illuminate\Http\Request $request) {
        $mb = fn () => round(memory_get_usage(true) / 1048576, 1);
        $stages = [];
        $stages['route_entry'] = $mb();

        $user = $request->user();
        $stages['after_user'] = $mb();

        $userId = $user?->getAuthIdentifier();
        DB::table('profiles')->where('user_id', $userId)->first(['company_id']);
        $stages['after_profile'] = $mb();

        try {
            DB::table('chat_messages as m')
                ->join('chat_participants as p', function ($join) use ($userId) {
                    $join->on('p.conversation_id', '=', 'm.conversation_id')
                        ->where('p.user_id', '=', $userId);
                })
                ->whereNull('m.deleted_at')
                ->where('m.sender_id', '!=', $userId)
                ->distinct()
                ->count('m.id');
            $stages['after_unread_query'] = $mb();
        } catch (\Throwable $e) {
            $stages['after_unread_query'] = 'error: ' . mb_substr($e->getMessage(), 0, 200);
        }

        return response()->json([
            'sapi'         => PHP_SAPI,
            'memory_limit' => ini_get('memory_limit'),
            'app_debug'    => (bool) config('app.debug'),
            'boot_mb'      => defined('APP_BOOT_MEM') ? round(APP_BOOT_MEM / 1048576, 1) : null,
            'stages'       => $stages,
            'peak_mb'      => round(memory_get_peak_usage(true) / 1048576, 1),
            'tokens'       => DB::table('personal_access_tokens')->where('tokenable_id', $userId)->count(),
            'loaded_files' => count(get_included_files()),
        ]);
    });

    // Пошаговая диагностика: где именно падает listing-запрос
    // (роли, company_id, Gate, raw SQL, EXPLAIN). Возвращает 200 даже
    // если один из шагов упал — ошибка шага пишется внутрь JSON.
    Route::get('/diag/db-probe', [\App\Http\Controllers\Api\DiagController::class, 'dbProbe']);
    // Маркеры последнего прогона probe — читаются, даже если процесс умер фаталом.
    Route::get('/diag/last-probe', [\App\Http\Controllers\Api\DiagController::class, 'lastProbe']);
    // Полные карточки последних фаталов (сообщение, файл, пик памяти, время жизни запроса).
    Route::get('/diag/last-fatal', [\App\Http\Controllers\Api\DiagController::class, 'lastFatal']);
    // Лимиты PHP веб-SAPI и состояние пула соединений MySQL.
    Route::get('/diag/limits', [\App\Http\Controllers\Api\DiagController::class, 'limits']);
    // Доступна ли storage/logs на запись веб-пользователю: без этого маркеры
    // и карточки фаталов теряются молча и диагностика врёт «фаталов не было».
    Route::get('/diag/write-test', [\App\Http\Controllers\Api\DiagController::class, 'writeTest']);



    // Брендинг компании: чтение/запись доступны без has.company-гейта,
    // т.к. данные нужны на любых страницах после логина.
    Route::get   ('/companies/{companyId}/branding', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'show']);
    Route::put   ('/companies/{companyId}/branding', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'update']);
    Route::delete('/companies/{companyId}/branding', [\App\Http\Controllers\Api\CompanyBrandingController::class, 'destroy']);

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
        // /chats/unread-count объявлен выше, вне verified/has.company.
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

        // ---- Gamification levels (Iteration 11) ----
        Route::apiResource('gamification-levels', \App\Http\Controllers\Api\GamificationLevelController::class)
            ->except(['show']);


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
        Route::get   ('/performance-cycles/{id}/open-preflight', [\App\Http\Controllers\Api\PerformanceController::class, 'openCyclePreflight']);
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

        // ---- AI settings (Phase 15: closed-loop deployment) ----
        Route::get ('/ai-settings',      [\App\Http\Controllers\Api\AiSettingsController::class, 'show']);
        Route::put ('/ai-settings',      [\App\Http\Controllers\Api\AiSettingsController::class, 'update']);
        Route::post('/ai-settings/test', [\App\Http\Controllers\Api\AiSettingsController::class, 'test']);

        // ---- RAG (Phase 16: local semantic search over company docs) ----
        Route::get   ('/rag/documents',              [\App\Http\Controllers\Api\RagController::class, 'index']);
        Route::post  ('/rag/documents',              [\App\Http\Controllers\Api\RagController::class, 'store']);
        Route::post  ('/rag/search',                 [\App\Http\Controllers\Api\RagController::class, 'search']);
        Route::delete('/rag/documents/{sourceId}',   [\App\Http\Controllers\Api\RagController::class, 'destroy']);

        // ---- Corporate University (Phase 17) ----
        Route::get   ('/university/courses',                 [\App\Http\Controllers\Api\CourseController::class, 'index']);
        Route::post  ('/university/courses',                 [\App\Http\Controllers\Api\CourseController::class, 'store']);
        Route::get   ('/university/courses/{id}',            [\App\Http\Controllers\Api\CourseController::class, 'show']);
        Route::patch ('/university/courses/{id}',            [\App\Http\Controllers\Api\CourseController::class, 'update']);
        Route::delete('/university/courses/{id}',            [\App\Http\Controllers\Api\CourseController::class, 'destroy']);
        Route::post  ('/university/courses/{id}/modules',    [\App\Http\Controllers\Api\CourseController::class, 'storeModule']);
        Route::patch ('/university/modules/{id}',            [\App\Http\Controllers\Api\CourseController::class, 'updateModule']);
        Route::delete('/university/modules/{id}',            [\App\Http\Controllers\Api\CourseController::class, 'destroyModule']);
        Route::post  ('/university/modules/{id}/lessons',    [\App\Http\Controllers\Api\CourseController::class, 'storeLesson']);
        Route::patch ('/university/lessons/{id}',            [\App\Http\Controllers\Api\CourseController::class, 'updateLesson']);
        Route::delete('/university/lessons/{id}',            [\App\Http\Controllers\Api\CourseController::class, 'destroyLesson']);

        Route::get   ('/university/my-enrollments',          [\App\Http\Controllers\Api\EnrollmentController::class, 'mine']);
        Route::get   ('/university/courses/{id}/enrollments',[\App\Http\Controllers\Api\EnrollmentController::class, 'byCourse']);
        Route::get   ('/university/courses/{id}/analytics',  [\App\Http\Controllers\Api\EnrollmentController::class, 'courseAnalytics']);
        Route::post  ('/university/enrollments',             [\App\Http\Controllers\Api\EnrollmentController::class, 'enroll']);
        Route::post  ('/university/enrollments/{id}/progress',[\App\Http\Controllers\Api\EnrollmentController::class, 'progress']);
        Route::get   ('/university/blockers',                [\App\Http\Controllers\Api\EnrollmentController::class, 'blockers']);
        Route::get   ('/university/certificate/{serial}',    [\App\Http\Controllers\Api\EnrollmentController::class, 'certificate']);

        // ---- Risk analytics (predictive HRD alerts) ----
        Route::post  ('/risks/recompute', [\App\Http\Controllers\Api\RiskController::class, 'recompute']);

        // ---- Wave 6: People Analytics ----
        Route::get('/people-analytics/headcount', [\App\Http\Controllers\Api\PeopleAnalyticsController::class, 'headcount']);
        Route::get('/people-analytics/tenure',    [\App\Http\Controllers\Api\PeopleAnalyticsController::class, 'tenure']);
        Route::get('/people-analytics/hiring',    [\App\Http\Controllers\Api\PeopleAnalyticsController::class, 'hiring']);
        Route::get('/people-analytics/absence',   [\App\Http\Controllers\Api\PeopleAnalyticsController::class, 'absence']);
        Route::get('/people-analytics/risk',      [\App\Http\Controllers\Api\PeopleAnalyticsController::class, 'risk']);

        // ---- Wave 7: Comfort Analytics (predictive employee comfort) ----
        Route::post('/comfort/recompute',        [\App\Http\Controllers\Api\ComfortController::class, 'recompute']);
        Route::get ('/comfort/company',          [\App\Http\Controllers\Api\ComfortController::class, 'company']);
        Route::get ('/comfort/department/{id}',  [\App\Http\Controllers\Api\ComfortController::class, 'department']);
        Route::get ('/comfort/user/{id}',        [\App\Http\Controllers\Api\ComfortController::class, 'user']);

        // ---- Wave 7: Initiatives (employee product proposals) ----
        Route::get   ('/initiatives',            [\App\Http\Controllers\Api\InitiativeController::class, 'index']);
        Route::post  ('/initiatives',            [\App\Http\Controllers\Api\InitiativeController::class, 'store']);
        Route::post  ('/initiatives/{id}/vote',  [\App\Http\Controllers\Api\InitiativeController::class, 'vote']);
        Route::patch ('/initiatives/{id}/review',[\App\Http\Controllers\Api\InitiativeController::class, 'review']);
        Route::delete('/initiatives/{id}',       [\App\Http\Controllers\Api\InitiativeController::class, 'destroy']);

        // ---- Pulse-опросы: массовые операции + таргетинг ----
        Route::post ('/pulse-surveys/{id}/questions/bulk',   [\App\Http\Controllers\Api\PulseSurveyController::class, 'bulkQuestions']);
        Route::get  ('/pulse-surveys/{id}/targets',          [\App\Http\Controllers\Api\PulseSurveyController::class, 'listTargets']);
        Route::post ('/pulse-surveys/{id}/targets',          [\App\Http\Controllers\Api\PulseSurveyController::class, 'saveTargets']);
        Route::post ('/pulse-surveys/{id}/roster/resolve',   [\App\Http\Controllers\Api\PulseSurveyController::class, 'resolveRoster']);
        Route::post ('/pulse-surveys/{id}/roster/commit',    [\App\Http\Controllers\Api\PulseSurveyController::class, 'commitRoster']);
        Route::get  ('/pulse-surveys/{id}/audience',         [\App\Http\Controllers\Api\PulseSurveyController::class, 'audience']);



        // ---- Wave 6: Integrations (webhooks + iCal) ----
        Route::get   ('/webhooks/events',              [\App\Http\Controllers\Api\WebhookController::class, 'events']);
        Route::get   ('/webhooks',                     [\App\Http\Controllers\Api\WebhookController::class, 'index']);
        Route::post  ('/webhooks',                     [\App\Http\Controllers\Api\WebhookController::class, 'store']);
        Route::patch ('/webhooks/{id}',                [\App\Http\Controllers\Api\WebhookController::class, 'update']);
        Route::delete('/webhooks/{id}',                [\App\Http\Controllers\Api\WebhookController::class, 'destroy']);
        Route::post  ('/webhooks/{id}/test',           [\App\Http\Controllers\Api\WebhookController::class, 'test']);
        Route::get   ('/webhooks/{id}/deliveries',     [\App\Http\Controllers\Api\WebhookController::class, 'deliveries']);
        Route::get   ('/integrations/ical/leaves-url', [\App\Http\Controllers\Api\IcalController::class, 'leavesUrl']);







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


