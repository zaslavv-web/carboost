<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Services\AuthUserService;
use App\Support\RuntimeEnv;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Yandex ID OAuth.
 *
 * Поток аналогичен Google: фронт открывает /api/auth/yandex/redirect,
 * Yandex редиректит на /api/auth/yandex/callback, бэк линкует/создаёт
 * пользователя и редиректит во фронт с #access_token=...
 *
 * Docs: https://yandex.ru/dev/id/doc/dg/oauth/concepts/about.html
 */
class YandexAuthController extends Controller
{
    private const AUTH_URL  = 'https://oauth.yandex.ru/authorize';
    private const TOKEN_URL = 'https://oauth.yandex.ru/token';
    private const INFO_URL  = 'https://login.yandex.ru/info';

    public function __construct(private AuthUserService $users) {}

    public function redirect(Request $request): RedirectResponse
    {
        $returnTo = $request->query('return_to', rtrim($this->frontendUrl(), '/') . '/auth/callback');

        $clientId    = $this->clientId();
        $redirectUri = $this->redirectUri();

        if (!$clientId || !$this->clientSecret() || !$redirectUri) {
            return redirect($returnTo . '#error=' . urlencode('Yandex ID не настроен на сервере: отсутствуют YANDEX_CLIENT_ID/SECRET'));
        }

        $state = rtrim(strtr(base64_encode(json_encode([
            'return_to' => $returnTo,
            'nonce'     => Str::random(16),
        ])), '+/', '-_'), '=');

        $url = self::AUTH_URL . '?' . http_build_query([
            'response_type' => 'code',
            'client_id'     => $clientId,
            'redirect_uri'  => $redirectUri,
            'state'         => $state,
            'force_confirm' => 'no',
        ]);

        return redirect()->away($url);
    }

    public function callback(Request $request): RedirectResponse
    {
        $returnTo = $this->returnToFromState($request->query('state'));
        $code = (string) $request->query('code', '');
        $error = (string) $request->query('error', '');

        if ($error !== '') {
            return redirect($returnTo . '#error=' . urlencode("Yandex OAuth: {$error}"));
        }
        if ($code === '') {
            return redirect($returnTo . '#error=' . urlencode('Yandex OAuth: missing code'));
        }

        $clientId     = $this->clientId();
        $clientSecret = $this->clientSecret();
        $redirectUri  = $this->redirectUri();

        if (!$clientId || !$clientSecret || !$redirectUri) {
            return redirect($returnTo . '#error=' . urlencode('Yandex OAuth не настроен'));
        }

        try {
            $tokenResp = Http::asForm()->timeout(10)->post(self::TOKEN_URL, [
                'grant_type'    => 'authorization_code',
                'code'          => $code,
                'client_id'     => $clientId,
                'client_secret' => $clientSecret,
                'redirect_uri'  => $redirectUri,
            ]);

            if (!$tokenResp->ok()) {
                throw new \RuntimeException('Token exchange failed: ' . $tokenResp->status() . ' ' . $tokenResp->body());
            }

            $accessToken = (string) ($tokenResp->json('access_token') ?? '');
            if ($accessToken === '') {
                throw new \RuntimeException('Empty access_token from Yandex');
            }

            $infoResp = Http::withToken($accessToken)->timeout(10)
                ->acceptJson()
                ->get(self::INFO_URL, ['format' => 'json']);

            if (!$infoResp->ok()) {
                throw new \RuntimeException('Yandex /info failed: ' . $infoResp->status() . ' ' . $infoResp->body());
            }

            $info = $infoResp->json();
            $email = strtolower((string) ($info['default_email'] ?? ($info['emails'][0] ?? '')));
            if ($email === '') {
                return redirect($returnTo . '#error=' . urlencode('Yandex не передал email — войдите через email/пароль'));
            }

            $avatarId  = (string) ($info['default_avatar_id'] ?? '');
            $avatarUrl = $avatarId !== ''
                ? "https://avatars.yandex.net/get-yapic/{$avatarId}/islands-200"
                : null;

            $user = $this->users->findOrCreateFromYandex([
                'id'     => (string) ($info['id'] ?? ''),
                'email'  => $email,
                'name'   => (string) ($info['real_name'] ?? $info['display_name'] ?? $info['login'] ?? $email),
                'avatar' => $avatarUrl,
                'login'  => (string) ($info['login'] ?? ''),
            ]);

            $token = $user->createToken('yandex-sso')->plainTextToken;
        } catch (\Throwable $e) {
            Log::error('Yandex OAuth failed', ['exception' => $e]);
            $detail = sprintf('%s: %s', class_basename($e), $e->getMessage());
            return redirect($returnTo . '#error=' . urlencode('Yandex OAuth failed: ' . $detail));
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

    private function clientId(): ?string
    {
        return RuntimeEnv::get('YANDEX_CLIENT_ID') ?: config('services.yandex.client_id');
    }

    private function clientSecret(): ?string
    {
        return RuntimeEnv::get('YANDEX_CLIENT_SECRET') ?: config('services.yandex.client_secret');
    }

    private function redirectUri(): ?string
    {
        $cfg = RuntimeEnv::get('YANDEX_REDIRECT_URI')
            ?: config('services.yandex.redirect')
            ?: (rtrim(RuntimeEnv::url('APP_URL', config('app.url')), '/') . '/api/auth/yandex/callback');
        return RuntimeEnv::absoluteUrl($cfg);
    }

    private function frontendUrl(): string
    {
        $infraUrl = trim((string) config('service-infra.frontend.url', ''));
        if ($infraUrl !== '') return rtrim($infraUrl, '/');
        return RuntimeEnv::url('FRONTEND_URL', RuntimeEnv::url('APP_FRONTEND_URL', config('app.url')));
    }
}
