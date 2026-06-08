<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Services\AuthUserService;
use App\Support\RuntimeEnv;
use App\Support\ServiceInfra;
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
        $returnTo = $request->query('return_to', rtrim($this->frontendUrl(), '/') . '/auth/callback');
        if (!$this->ensureGoogleConfig()) {
            return redirect($returnTo . '#error=' . urlencode('Google OAuth не настроен на сервере: отсутствуют GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET'));
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
            return redirect($returnTo . '#error=' . urlencode('Google OAuth не настроен на сервере: отсутствуют GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET'));
        }

        try {
            $google = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable $e) {
            \Log::error('Google OAuth Socialite failed', ['exception' => $e]);
            return redirect($returnTo . '#error=' . urlencode('Google OAuth failed: ' . $e->getMessage()));
        }

        try {
            $user = $this->users->findOrCreateFromGoogle([
                'id'     => $google->getId(),
                'email'  => $google->getEmail(),
                'name'   => $google->getName(),
                'avatar' => $google->getAvatar(),
            ]);

            $token = $user->createToken('google-sso')->plainTextToken;
        } catch (\Throwable $e) {
            \Log::error('Google OAuth user provisioning failed', [
                'exception' => $e,
                'email'     => $google->getEmail(),
            ]);
            $detail = sprintf(
                '%s: %s @ %s:%d',
                class_basename($e),
                $e->getMessage(),
                basename($e->getFile()),
                $e->getLine()
            );
            return redirect($returnTo . '#error=' . urlencode('Google OAuth provisioning failed: ' . $detail));
        }

        return redirect($returnTo . '#access_token=' . urlencode($token));
    }

    private function returnToFromState(?string $state): string
    {
        $fallback = rtrim($this->frontendUrl(), '/') . '/auth/callback';
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
        $infra = ServiceInfra::google();

        $clientId = $infra['client_id'] ?: (RuntimeEnv::get('GOOGLE_CLIENT_ID') ?: config('services.google.client_id'));
        $clientSecret = $infra['client_secret'] ?: (RuntimeEnv::get('GOOGLE_CLIENT_SECRET') ?: config('services.google.client_secret'));
        $redirect = RuntimeEnv::absoluteUrl(
            $infra['redirect_uri']
                ?: RuntimeEnv::get('GOOGLE_REDIRECT_URI')
                ?: config('services.google.redirect')
                ?: rtrim(RuntimeEnv::url('APP_URL', config('app.url')), '/') . '/api/auth/google/callback'
        );

        config([
            'services.google.client_id' => $clientId,
            'services.google.client_secret' => $clientSecret,
            'services.google.redirect' => $redirect,
        ]);

        return !empty($clientId) && !empty($clientSecret) && !empty($redirect);
    }

    private function frontendUrl(): string
    {
        $infraUrl = ServiceInfra::frontendUrl();
        if ($infraUrl !== '') {
            return $infraUrl;
        }
        return RuntimeEnv::url('FRONTEND_URL', RuntimeEnv::url('APP_FRONTEND_URL', config('app.url')));
    }
}
