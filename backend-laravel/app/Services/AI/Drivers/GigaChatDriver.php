<?php

namespace App\Services\AI\Drivers;

use App\Services\AI\AiGatewayException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GigaChat (Сбер). OAuth2 client_credentials → access_token → /chat/completions (OpenAI-style).
 * https://developers.sber.ru/docs/ru/gigachat/api/overview
 *
 * extra:
 *   scope: GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP
 *   auth_url (default https://ngw.devices.sberbank.ru:9443/api/v2/oauth)
 *   verify (default true) — false для on-prem без сертификата
 *
 * api_key хранит ровно "Authorization key" из личного кабинета GigaChat
 * (base64(client_id:client_secret)).
 */
class GigaChatDriver implements LlmDriverInterface
{
    public function __construct(
        protected string $apiUrl,   // https://gigachat.devices.sberbank.ru/api/v1/chat/completions
        protected string $apiKey,
        protected string $defaultModel, // GigaChat | GigaChat-Pro | GigaChat-Max
        protected array $extra = [],
    ) {}

    public function name(): string { return 'gigachat'; }

    protected function token(): string
    {
        $scope = $this->extra['scope'] ?? 'GIGACHAT_API_PERS';
        $cacheKey = 'gigachat_token_' . md5($this->apiKey . $scope);
        return Cache::remember($cacheKey, 1500, function () use ($scope) {
            $authUrl = $this->extra['auth_url'] ?? 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
            $verify = $this->extra['verify'] ?? true;

            $response = Http::withHeaders([
                'Authorization' => 'Basic ' . $this->apiKey,
                'Content-Type' => 'application/x-www-form-urlencoded',
                'Accept' => 'application/json',
                'RqUID' => (string) \Illuminate\Support\Str::uuid(),
            ])->withOptions(['verify' => $verify])->timeout(30)
              ->asForm()->post($authUrl, ['scope' => $scope]);

            if (! $response->successful()) {
                Log::error('GigaChat auth failed', ['status' => $response->status(), 'body' => $response->body()]);
                throw new AiGatewayException('GigaChat: не удалось получить токен', 500);
            }
            return (string) $response->json('access_token');
        });
    }

    public function chat(array $messages, array $options = []): array
    {
        $verify = $this->extra['verify'] ?? true;
        $payload = array_merge([
            'model' => $options['model'] ?? $this->defaultModel,
            'messages' => $messages,
            'temperature' => $options['temperature'] ?? 0.3,
        ], array_diff_key($options, ['model' => true, 'temperature' => true]));

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $this->token(),
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ])->withOptions(['verify' => $verify])->timeout(120)->post($this->apiUrl, $payload);

        if (! $response->successful()) {
            $status = $response->status();
            Log::error('GigaChat error', ['status' => $status, 'body' => $response->body()]);
            throw new AiGatewayException('Ошибка GigaChat: ' . $response->body(), $status ?: 500);
        }

        return $response->json() ?? [];
    }

    public function stream(array $messages, array $options = []): StreamedResponse
    {
        $verify = $this->extra['verify'] ?? true;
        $payload = array_merge([
            'model' => $options['model'] ?? $this->defaultModel,
            'messages' => $messages,
            'stream' => true,
        ], array_diff_key($options, ['model' => true]));

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $this->token(),
            'Accept' => 'text/event-stream',
        ])->withOptions(['verify' => $verify, 'stream' => true])->post($this->apiUrl, $payload);

        if (! $response->successful()) {
            $status = $response->status();
            throw new AiGatewayException('Ошибка GigaChat stream', $status ?: 500);
        }

        $stream = $response->toPsrResponse()->getBody();

        return new StreamedResponse(function () use ($stream) {
            while (! $stream->eof()) {
                echo $stream->read(4096);
                @ob_flush();
                @flush();
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
