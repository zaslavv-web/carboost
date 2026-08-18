<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthUserService;
use App\Services\SecurityAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Epic B3 — вход через корпоративный IdP.
 *  - OIDC: /sso/{id}/start → редирект в IdP → /sso/{id}/callback
 *  - SAML 2.0: /sso/{id}/metadata (SP-метаданные) и POST /sso/{id}/acs (assertion)
 *
 * Все роуты публичные (пользователь ещё не авторизован).
 */
class SsoController extends Controller
{
    public function __construct(private AuthUserService $users) {}

    /** GET /api/sso/discover?email=user@corp.ru — какой провайдер использовать. */
    public function discover(Request $request): JsonResponse
    {
        $email = strtolower((string) $request->query('email', ''));
        $domain = Str::after($email, '@');
        if (!$domain) return response()->json(['provider' => null]);

        $row = DB::table('sso_providers')
            ->where('is_active', true)
            ->where('domain_hint', $domain)
            ->first(['id', 'kind', 'title']);

        return response()->json(['provider' => $row]);
    }

    /** GET /api/sso/{id}/start — начало OIDC-потока. */
    public function start(string $id, Request $request)
    {
        $p = $this->provider($id);
        if ($p->kind !== 'oidc') {
            return response()->json(['message' => 'Провайдер SAML: используйте вход со стороны IdP.'], 422);
        }
        if (!$p->authorize_url || !$p->client_id) {
            return response()->json(['message' => 'Провайдер настроен не полностью.'], 422);
        }

        $state = Str::random(40);
        Cache::put('sso:state:' . $state, ['provider' => $p->id, 'redirect' => $request->query('redirect')], 600);

        $url = $p->authorize_url . (str_contains($p->authorize_url, '?') ? '&' : '?') . http_build_query([
            'response_type' => 'code',
            'client_id'     => $p->client_id,
            'redirect_uri'  => $this->callbackUrl($p->id),
            'scope'         => $p->scopes ?: 'openid email profile',
            'state'         => $state,
        ]);

        return redirect()->away($url);
    }

    /** GET /api/sso/{id}/callback — обмен кода на токен и вход. */
    public function callback(string $id, Request $request)
    {
        $p = $this->provider($id);
        $state = (string) $request->query('state');
        $cached = Cache::pull('sso:state:' . $state);
        if (!$cached || ($cached['provider'] ?? null) !== $p->id) {
            return $this->frontendRedirect(null, 'Некорректный state — повторите вход.');
        }

        try {
            $res = Http::asForm()->timeout(10)->post($p->token_url, [
                'grant_type'    => 'authorization_code',
                'code'          => (string) $request->query('code'),
                'redirect_uri'  => $this->callbackUrl($p->id),
                'client_id'     => $p->client_id,
                'client_secret' => $p->client_secret,
            ]);
            if (!$res->successful()) {
                return $this->frontendRedirect(null, 'IdP отклонил запрос токена.');
            }
            $payload = $res->json();
            $claims = $this->decodeIdToken($payload['id_token'] ?? null);

            if ((!$claims || empty($claims['email'])) && $p->userinfo_url && !empty($payload['access_token'])) {
                $ui = Http::withToken($payload['access_token'])->timeout(10)->get($p->userinfo_url);
                if ($ui->successful()) $claims = array_merge($claims ?? [], $ui->json() ?: []);
            }

            $email = strtolower((string) ($claims['email'] ?? ''));
            if (!$email) return $this->frontendRedirect(null, 'IdP не передал email.');

            $name = (string) ($claims['name'] ?? $claims['preferred_username'] ?? $email);
            $user = $this->resolveUser($p, $email, $name);
            if (!$user) return $this->frontendRedirect(null, 'Пользователь не найден, а автосоздание отключено.');

            $token = $user->createToken('sso')->plainTextToken;
            DB::table('sso_providers')->where('id', $p->id)->update(['last_login_at' => now()]);

            SecurityAudit::log([
                'company_id' => $p->company_id, 'user_id' => $user->id, 'actor_email' => $user->email,
                'event' => 'sso.login', 'category' => 'auth',
                'target_type' => 'sso_provider', 'target_id' => $p->id,
            ]);

            return $this->frontendRedirect($token, null);
        } catch (\Throwable $e) {
            return $this->frontendRedirect(null, 'Ошибка SSO: ' . $e->getMessage());
        }
    }

    /** GET /api/sso/{id}/metadata — SP-метаданные для настройки IdP. */
    public function metadata(string $id)
    {
        $p = $this->provider($id);
        $base = $this->baseUrl();
        $entity = $base . '/api/sso/' . $p->id . '/metadata';
        $acs = $base . '/api/sso/' . $p->id . '/acs';

        $xml = <<<XML
<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="{$entity}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="{$acs}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>
XML;

        return response($xml, 200, ['Content-Type' => 'application/xml']);
    }

    /** POST /api/sso/{id}/acs — приём SAML-ответа от IdP. */
    public function acs(string $id, Request $request)
    {
        $p = $this->provider($id);
        $raw = (string) $request->input('SAMLResponse');
        if (!$raw) return $this->frontendRedirect(null, 'Пустой SAMLResponse.');

        try {
            $xml = base64_decode($raw, true);
            if ($xml === false) return $this->frontendRedirect(null, 'Некорректный SAMLResponse.');

            [$email, $name] = $this->parseSamlSubject($xml);
            if (!$email) return $this->frontendRedirect(null, 'В SAML-ответе нет email.');

            $user = $this->resolveUser($p, strtolower($email), $name ?: $email);
            if (!$user) return $this->frontendRedirect(null, 'Пользователь не найден, а автосоздание отключено.');

            $token = $user->createToken('sso')->plainTextToken;
            DB::table('sso_providers')->where('id', $p->id)->update(['last_login_at' => now()]);

            SecurityAudit::log([
                'company_id' => $p->company_id, 'user_id' => $user->id, 'actor_email' => $user->email,
                'event' => 'sso.login', 'category' => 'auth',
                'target_type' => 'sso_provider', 'target_id' => $p->id, 'payload' => ['kind' => 'saml'],
            ]);

            return $this->frontendRedirect($token, null);
        } catch (\Throwable $e) {
            return $this->frontendRedirect(null, 'Ошибка обработки SAML: ' . $e->getMessage());
        }
    }

    // ---------- helpers ----------

    /** Ищет пользователя по email, при JIT — создаёт. */
    private function resolveUser(object $p, string $email, string $name): ?User
    {
        $user = User::where('email', $email)->first();
        if ($user) {
            try { $this->users->repairDomainRowsForLogin($user); $user = $user->refresh(); } catch (\Throwable) {}
            return $user;
        }
        if (!$p->jit_provisioning) return null;

        return $this->users->createWithPassword(
            $email,
            Str::random(40),
            $name,
            $p->default_role ?: 'employee',
            $p->company_id,
            true,
        );
    }

    /** Достаёт email/имя из SAML-ассерции без внешних библиотек. */
    private function parseSamlSubject(string $xml): array
    {
        $email = null;
        $name = null;

        if (preg_match('/<(?:\w+:)?NameID[^>]*>([^<]+)</i', $xml, $m)) {
            $candidate = trim($m[1]);
            if (filter_var($candidate, FILTER_VALIDATE_EMAIL)) $email = $candidate;
        }
        if (preg_match_all('/<(?:\w+:)?Attribute[^>]*Name="([^"]+)"[^>]*>(.*?)<\/(?:\w+:)?Attribute>/is', $xml, $ms, PREG_SET_ORDER)) {
            foreach ($ms as $set) {
                $attr = strtolower($set[1]);
                if (!preg_match('/<(?:\w+:)?AttributeValue[^>]*>([^<]*)</i', $set[2], $v)) continue;
                $val = trim($v[1]);
                if (!$val) continue;
                if (!$email && (str_contains($attr, 'email') || str_contains($attr, 'emailaddress'))) $email = $val;
                if (!$name && (str_contains($attr, 'displayname') || str_contains($attr, 'name') && !str_contains($attr, 'nameid'))) $name = $val;
            }
        }
        return [$email, $name];
    }

    private function decodeIdToken(?string $jwt): ?array
    {
        if (!$jwt) return null;
        $parts = explode('.', $jwt);
        if (count($parts) < 2) return null;
        $payload = base64_decode(strtr($parts[1], '-_', '+/'), false);
        $data = $payload ? json_decode($payload, true) : null;
        return is_array($data) ? $data : null;
    }

    private function provider(string $id): object
    {
        $row = DB::table('sso_providers')->where('id', $id)->where('is_active', true)->first();
        if (!$row) abort(404);
        return $row;
    }

    private function baseUrl(): string
    {
        return rtrim(config('app.url') ?: url('/'), '/');
    }

    private function callbackUrl(string $id): string
    {
        return $this->baseUrl() . '/api/sso/' . $id . '/callback';
    }

    /** Возвращает пользователя во фронтенд с токеном в hash-фрагменте. */
    private function frontendRedirect(?string $token, ?string $error)
    {
        $front = rtrim((string) (config('app.frontend_url') ?: env('FRONTEND_URL') ?: $this->baseUrl()), '/');
        $target = $front . '/auth/sso#' . http_build_query(array_filter([
            'token' => $token,
            'error' => $error,
        ]));
        return redirect()->away($target);
    }
}
