<?php

/**
 * API-only backend: веб-маршрутов у приложения нет, но файл обязателен —
 * bootstrap/app.php подключает его в withRouting(web: ...), и без него
 * приложение падает на чистом клоне репозитория.
 *
 * Держим здесь только безопасный минимум: корень отдаёт JSON-визитку сервиса,
 * чтобы случайный заход в браузер не отдавал 404-страницу Laravel.
 */

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\StorageController;

Route::get('/', function () {
    return response()->json([
        'service' => config('app.name'),
        'api'     => url('/api'),
        'health'  => url('/api/health'),
    ]);
});

Route::get('/storage/{bucket}/{path}', [StorageController::class, 'publicFile'])->where('path', '.*');
