<?php

namespace App\Services;

use App\Support\ClientIp;
use App\Support\RuntimeEnv;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Определение страны по IP без сторонних библиотек.
 *
 * Источники (по приоритету):
 *   1. Заголовок CF-IPCountry (если за Cloudflare) — мгновенно, бесплатно.
 *   2. HTTP к ipapi.co / ip-api.com — с кэшем 24 часа на IP.
 *
 * Полностью отключается переменной окружения GEOIP_DISABLED=1
 * (например, для локальной разработки). В этом случае countryFor() всегда null,
 * и блокировки не срабатывают — провайдеры показываются как обычно.
 */
class GeoIpService
{
    private const CACHE_TTL = 86400; // 24h

    public function countryForRequest(Request $request): ?string
    {
        if ($this->disabled()) return null;

        // 1) Cloudflare header — самый дешёвый источник.
        $cf = strtoupper(trim((string) $request->headers->get('CF-IPCountry', '')));
        if ($cf !== '' && $cf !== 'XX' && $cf !== 'T1' && strlen($cf) === 2) {
            return $cf;
        }

        $ip = ClientIp::resolve($request);
        if (!$ip || !ClientIp::isPublic($ip)) return null;

        return $this->countryFor($ip);
    }

    public function countryFor(string $ip): ?string
    {
        if ($this->disabled()) return null;
        if (!filter_var($ip, FILTER_VALIDATE_IP) || !ClientIp::isPublic($ip)) return null;

        $cacheKey = 'geoip:country:' . $ip;
        $cached = Cache::get($cacheKey);
        if ($cached === 'NULL') return null;
        if (is_string($cached) && strlen($cached) === 2) return $cached;

        $country = $this->lookupExternal($ip);

        Cache::put($cacheKey, $country ?? 'NULL', self::CACHE_TTL);
        return $country;
    }

    private function lookupExternal(string $ip): ?string
    {
        $provider = strtolower((string) RuntimeEnv::get('GEOIP_PROVIDER', 'ip-api'));

        // Порядок попыток: предпочтительный провайдер, затем fallback.
        $order = $provider === 'ipapi' || $provider === 'ipapi_co'
            ? ['ipapi', 'ip-api']
            : ['ip-api', 'ipapi'];

        foreach ($order as $p) {
            $country = $this->tryProvider($p, $ip);
            if ($country !== null) return $country;
        }
        return null;
    }

    private function tryProvider(string $provider, string $ip): ?string
    {
        try {
            if ($provider === 'ip-api' || $provider === 'ipapi_com') {
                $resp = Http::timeout(3)->get("http://ip-api.com/json/{$ip}", ['fields' => 'countryCode,status']);
                if ($resp->ok()) {
                    $data = $resp->json();
                    if (($data['status'] ?? '') === 'success' && !empty($data['countryCode'])) {
                        return strtoupper((string) $data['countryCode']);
                    }
                }
                return null;
            }

            // ipapi.co (HTTPS, без ключа)
            $resp = Http::timeout(3)->acceptJson()->get("https://ipapi.co/{$ip}/country/");
            if ($resp->ok()) {
                $body = trim($resp->body());
                if (preg_match('/^[A-Z]{2}$/', $body)) return $body;
            }
        } catch (ConnectionException $e) {
            Log::warning('GeoIP lookup failed (connection)', ['provider' => $provider, 'ip' => $ip, 'err' => $e->getMessage()]);
        } catch (\Throwable $e) {
            Log::warning('GeoIP lookup failed', ['provider' => $provider, 'ip' => $ip, 'err' => $e->getMessage()]);
        }
        return null;
    }

    public function disabled(): bool
    {
        $flag = strtolower((string) RuntimeEnv::get('GEOIP_DISABLED', '0'));
        return in_array($flag, ['1', 'true', 'yes', 'on'], true);
    }
}
