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
use Illuminate\Support\Facades\Route;

/*
| API routes (Phase 6 — full CRUD).
| Префикс /api добавляется автоматически (bootstrap/app.php).
*/

// ---- Public ----
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login',    [AuthController::class, 'login']);
Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);

// ---- Authenticated (Sanctum token) ----
Route::middleware(['auth:sanctum', 'effective.user'])->group(function () {
    // Auth + impersonation
    Route::get('/auth/me',      [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/impersonation/start', [ImpersonationController::class, 'start']);
    Route::post('/impersonation/stop',  [ImpersonationController::class, 'stop']);

    // Профиль текущего пользователя — без has.company (нужен на CompleteRegistration)
    Route::get('/profiles/me', [ProfileController::class, 'me']);

    // Verified + has-company gated routes
    Route::middleware(['verified.user', 'has.company'])->group(function () {
        // Профили
        Route::get('/profiles',                  [ProfileController::class, 'index']);
        Route::get('/profiles/{id}',             [ProfileController::class, 'show']);
        Route::patch('/profiles/{id}',           [ProfileController::class, 'update']);
        Route::post('/profiles/{id}/verify',     [ProfileController::class, 'verify']);

        // Уведомления
        Route::apiResource('notifications', NotificationController::class)->except(['update']);
        Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);

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
    });
});
