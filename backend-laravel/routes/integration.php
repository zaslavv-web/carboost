<?php

use App\Http\Controllers\Api\V1\EventFeedController;
use App\Http\Controllers\Api\V1\MetaController;
use App\Http\Controllers\Api\V1\ResourceController;
use Illuminate\Support\Facades\Route;

/**
 * Интеграционное API (машинный доступ по API-ключу).
 *
 * Монтируется в bootstrap/app.php под префиксом /api/integration/v1 отдельно
 * от routes/api.php: тот файл дополнительно монтируется как алиас /api/v1 для
 * SPA, и общий префикс приводил бы к дублям маршрутов.
 *
 * Все маршруты проходят AuthenticateApiKey, скоупы проверяются в контроллерах
 * по реестру ресурсов.
 */
Route::middleware(['api.key', 'throttle:600,1'])->group(function () {
    // Самоописание: каталог ресурсов, скоупы, события, схема OpenAPI.
    Route::get('/meta/resources', [MetaController::class, 'resources']);
    Route::get('/openapi.json',   [MetaController::class, 'openapi']);

    // Фид событий — страховка на случай недоставленных вебхуков.
    Route::get('/events', [EventFeedController::class, 'index']);

    // Данные в обе стороны. Ресурс проверяется по реестру внутри контроллера,
    // поэтому новый раздел продукта не требует правки маршрутов.
    Route::get   ('/{resource}',        [ResourceController::class, 'index']);
    Route::post  ('/{resource}',        [ResourceController::class, 'store']);
    Route::post  ('/{resource}/upsert', [ResourceController::class, 'upsert']);
    Route::get   ('/{resource}/{id}',   [ResourceController::class, 'show']);
    Route::patch ('/{resource}/{id}',   [ResourceController::class, 'update']);
    Route::put   ('/{resource}/{id}',   [ResourceController::class, 'update']);
    Route::delete('/{resource}/{id}',   [ResourceController::class, 'destroy']);
});
