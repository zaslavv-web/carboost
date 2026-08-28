<?php

namespace App\Http\Middleware;

use App\Integration\ApiContext;
use App\Models\ApiKey;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Аутентификация машинного клиента по ключу вида `gp_<prefix>_<secret>`.
 *
 * Префикс ищется по индексу, секрет сверяется хешем в постоянном времени.
 * Успешный контекст кладётся в атрибут запроса `api_context`.
 */
class AuthenticateApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->extractToken($request);
        if ($token === null) {
            return $this->unauthorized('Не передан ключ в заголовке Authorization: Bearer');
        }

        $parts = explode('_', $token);
        if (count($parts) !== 3 || $parts[0] !== 'gp') {
            return $this->unauthorized('Некорректный формат ключа');
        }

        [, $prefix, $secret] = $parts;

        $key = ApiKey::query()->where('prefix', $prefix)->first();
        if ($key === null || !hash_equals((string) $key->token_hash, hash('sha256', $secret))) {
            return $this->unauthorized('Ключ не найден или отозван');
        }

        if (!$key->isUsable()) {
            return $this->unauthorized('Ключ отозван или истёк');
        }

        if (!$this->ipAllowed($key, (string) $request->ip())) {
            return $this->forbidden('IP-адрес не входит в список разрешённых для ключа');
        }

        $request->attributes->set('api_context', new ApiContext(
            keyId: (string) $key->id,
            companyId: (string) $key->company_id,
            scopes: is_array($key->scopes) ? $key->scopes : [],
        ));

        // Отметка использования не должна ронять запрос при гонке записи.
        try {
            $key->forceFill(['last_used_at' => now(), 'last_used_ip' => $request->ip()])->saveQuietly();
        } catch (\Throwable) {
            // журнал использования — вспомогательный, тишина здесь допустима
        }

        return $next($request);
    }

    private function extractToken(Request $request): ?string
    {
        $header = (string) $request->header('Authorization', '');
        if (preg_match('/^Bearer\s+(\S+)$/i', $header, $m) === 1) {
            return $m[1];
        }

        return null;
    }

    /** Пустой список означает «без ограничения по адресу». */
    private function ipAllowed(ApiKey $key, string $ip): bool
    {
        $allow = $key->ip_allowlist;
        if (!is_array($allow) || $allow === []) {
            return true;
        }

        foreach ($allow as $entry) {
            if ($this->matchesCidr($ip, (string) $entry)) {
                return true;
            }
        }

        return false;
    }

    private function matchesCidr(string $ip, string $range): bool
    {
        if (!str_contains($range, '/')) {
            return $ip === $range;
        }

        [$subnet, $bits] = explode('/', $range, 2);
        $ipLong = ip2long($ip);
        $subnetLong = ip2long($subnet);
        if ($ipLong === false || $subnetLong === false) {
            return false;
        }

        $bits = (int) $bits;
        if ($bits < 0 || $bits > 32) {
            return false;
        }
        if ($bits === 0) {
            return true;
        }

        $mask = -1 << (32 - $bits);

        return ($ipLong & $mask) === ($subnetLong & $mask);
    }

    private function unauthorized(string $message): JsonResponse
    {
        return response()->json(['error' => 'unauthorized', 'message' => $message], 401);
    }

    private function forbidden(string $message): JsonResponse
    {
        return response()->json(['error' => 'forbidden', 'message' => $message], 403);
    }
}
