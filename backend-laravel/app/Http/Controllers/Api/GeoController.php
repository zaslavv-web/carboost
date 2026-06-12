<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\GeoIpService;
use App\Support\RuntimeEnv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/geo
 *
 * Сообщает фронту страну запроса и список разрешённых способов входа.
 * Используется на странице логина, чтобы для пользователей из РФ скрывать
 * кнопку Google и оставлять Yandex ID + email/password.
 */
class GeoController extends Controller
{
    public function __invoke(Request $request, GeoIpService $geo): JsonResponse
    {
        $country = $geo->countryForRequest($request);
        $isRu = $country === 'RU';

        $yandexConfigured = (bool) (RuntimeEnv::get('YANDEX_CLIENT_ID') && RuntimeEnv::get('YANDEX_CLIENT_SECRET'));
        $googleConfigured = (bool) (RuntimeEnv::get('GOOGLE_CLIENT_ID') && RuntimeEnv::get('GOOGLE_CLIENT_SECRET'));

        return response()->json([
            'country'   => $country,
            'is_ru'     => $isRu,
            'providers' => [
                'email'  => true,
                'google' => $googleConfigured && !$isRu,
                'yandex' => $yandexConfigured,
            ],
            'reason'    => $isRu ? 'google_blocked_ru' : null,
        ]);
    }
}
