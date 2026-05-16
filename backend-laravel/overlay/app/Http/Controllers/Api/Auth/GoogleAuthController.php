<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Services\AuthUserService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;

/**
 * Google SSO через Laravel Socialite + редирект во фронт с токеном.
 *
 * Поток:
 *   1. Frontend: window.location = `${API}/api/auth/google/redirect?return_to=...`
 *   2. Backend → Google → Backend `/api/auth/google/callback`
 *   3. Backend линкует/создаёт пользователя в auth.users, выпускает Sanctum token
 *   4. Backend редиректит на `${return_to}#access_token=...`
 *   5. Frontend парсит hash, кладёт токен в localStorage, вызывает /api/auth/me
 *
 * Пользователи с Google SSO Supabase продолжают входить — линковка по email.
 */
class GoogleAuthController extends Controller
{
    public function __construct(private AuthUserService $users) {}

    /** GET /api/auth/google/redirect?return_to=https://app.example.ru/auth/callback */
    public function redirect(Request $request): RedirectResponse
    {
        $returnTo = $request->query('return_to', rtrim(env('APP_FRONTEND_URL', config('app.url')), '/') . '/auth/callback');
        $state = rtrim(strtr(base64_encode(json_encode(['return_to' => $returnTo])), '+/', '-_'), '=');

        return Socialite::driver('google')
            ->scopes(['openid', 'profile', 'email'])
            ->stateless()
            ->with(['state' => $state])
            ->redirect();
    }

    /** GET /api/auth/google/callback */
    public function callback(Request $request): RedirectResponse
    {
        $returnTo = $this->returnToFromState($request->query('state'));

        try {
            $google = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable $e) {
            return redirect($returnTo . '#error=' . urlencode('Google OAuth failed'));
        }

        $user = $this->users->findOrCreateFromGoogle([
            'id'     => $google->getId(),
            'email'  => $google->getEmail(),
            'name'   => $google->getName(),
            'avatar' => $google->getAvatar(),
        ]);

        $token = $user->createToken('google-sso')->plainTextToken;

        return redirect($returnTo . '#access_token=' . urlencode($token));
    }

    private function returnToFromState(?string $state): string
    {
        $fallback = rtrim(env('APP_FRONTEND_URL', config('app.url')), '/') . '/auth/callback';
        if (!$state) return $fallback;

        $decoded = base64_decode(strtr($state, '-_', '+/'), true);
        $payload = $decoded ? json_decode($decoded, true) : null;
        return is_array($payload) && !empty($payload['return_to']) ? (string) $payload['return_to'] : $fallback;
    }
}
