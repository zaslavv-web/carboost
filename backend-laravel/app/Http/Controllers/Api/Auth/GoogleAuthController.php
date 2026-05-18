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
        if (!$this->ensureGoogleConfig()) {
            return redirect($returnTo . '#error=' . urlencode('Google OAuth не настроен: отсутствует GOOGLE_CLIENT_ID'));
        }

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

        if (!$this->ensureGoogleConfig()) {
            return redirect($returnTo . '#error=' . urlencode('Google OAuth не настроен: отсутствует GOOGLE_CLIENT_ID'));
        }

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

    /**
     * Config-cache на сервере часто остаётся со старым пустым services.google.
     * Подтягиваем значения из окружения/.env и кладём их в config перед Socialite.
     */
    private function ensureGoogleConfig(): bool
    {
        $fileEnv = $this->readDotEnv();
        $clientId = $this->envValue('GOOGLE_CLIENT_ID', $fileEnv) ?: config('services.google.client_id');
        $clientSecret = $this->envValue('GOOGLE_CLIENT_SECRET', $fileEnv) ?: config('services.google.client_secret');
        $redirect = $this->envValue('GOOGLE_REDIRECT_URI', $fileEnv)
            ?: config('services.google.redirect')
            ?: rtrim(config('app.url'), '/') . '/api/auth/google/callback';

        config([
            'services.google.client_id' => $clientId,
            'services.google.client_secret' => $clientSecret,
            'services.google.redirect' => $redirect,
        ]);

        return !empty($clientId) && !empty($clientSecret) && !empty($redirect);
    }

    private function envValue(string $key, array $fileEnv): ?string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key) ?: ($fileEnv[$key] ?? null);
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    private function readDotEnv(): array
    {
        $path = base_path('.env');
        if (!is_readable($path)) return [];

        $values = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;

            [$key, $value] = explode('=', $line, 2);
            $values[trim($key)] = trim(trim($value), "\"'");
        }
        return $values;
    }
}
