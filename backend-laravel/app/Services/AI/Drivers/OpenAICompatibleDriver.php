<?php

namespace App\Services\AI\Drivers;

use App\Services\AI\AiGatewayException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Универсальный драйвер для OpenAI-совместимых API:
 * OpenAI, Azure OpenAI, vLLM, Ollama, LM Studio, OpenRouter, Lovable AI Gateway, и т.п.
 *
 * Также используется как базовый для GeminiDriver (тот же endpoint).
 */
class OpenAICompatibleDriver implements LlmDriverInterface
{
    public function __construct(
        protected string $apiUrl,
        protected string $apiKey,
        protected string $defaultModel,
        protected string $name = 'openai_compatible',
        protected array $extra = [],
    ) {}

    public function name(): string
    {
        return $this->name;
    }

    public function chat(array $messages, array $options = []): array
    {
        $payload = array_merge(
            ['model' => $options['model'] ?? $this->defaultModel, 'messages' => $messages],
            array_diff_key($options, ['model' => true])
        );

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $this->apiKey,
            'Content-Type' => 'application/json',
        ])->timeout(120)->post($this->apiUrl, $payload);

        $this->throwOnError($response);

        return $response->json() ?? [];
    }

    public function stream(array $messages, array $options = []): StreamedResponse
    {
        $payload = array_merge(
            ['model' => $options['model'] ?? $this->defaultModel, 'messages' => $messages, 'stream' => true],
            array_diff_key($options, ['model' => true])
        );

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . $this->apiKey,
            'Accept' => 'text/event-stream',
        ])->withOptions(['stream' => true])->post($this->apiUrl, $payload);

        $this->throwOnError($response);

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

    protected function throwOnError(Response $response): void
    {
        if ($response->successful()) {
            return;
        }
        $status = $response->status();
        if ($status === 429) {
            throw new AiGatewayException('Превышен лимит запросов AI', 429);
        }
        if ($status === 402) {
            throw new AiGatewayException('Закончились кредиты AI gateway', 402);
        }
        Log::error('AI ' . $this->name . ' error', ['status' => $status, 'body' => $response->body()]);
        throw new AiGatewayException('Ошибка AI gateway (' . $this->name . ')', $status ?: 500);
    }
}
