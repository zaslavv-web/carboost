<?php

use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Auth\GoogleAuthController;
use Illuminate\Support\Facades\Route;

/*
| API routes (Phase 3 — Auth only)
| Префикс /api добавляется автоматически (bootstrap/app.php).
*/

// ---- Public ----
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login',    [AuthController::class, 'login']);

// Google SSO (browser-redirect, без CSRF — stateless callback с session state)
Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);

// ---- Authenticated (Sanctum token) ----
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me',     [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Verified-only routes будут добавлены в Фазе 5.
    // Пример:
    // Route::middleware(['verified.user', 'has.company'])->group(function () {
    //     Route::apiResource('career-tracks', CareerTrackController::class);
    // });
});
