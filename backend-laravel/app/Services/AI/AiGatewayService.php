<?php

namespace App\Services\AI;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Central AI gateway client. Compatible with any OpenAI-style Chat Completions
 * endpoint (OpenAI, OpenRouter, vLLM, Ollama, self-hosted gateway).
 *
 * Configured via env:
 *   AI_API_URL   — full Chat Completions endpoint
 *   AI_API_KEY   — bearer token
 *   AI_MODEL     — default model id
 */
class AiGatewayService
{
    public function __construct(
        protected ?string $apiUrl = null,
        protected ?string $apiKey = null,
        protected ?string $defaultModel = null,
    ) {
        $infra = \App\Support\ServiceInfra::ai();
        $this->apiUrl ??= ($infra['url'] ?? null) ?: env('AI_API_URL', 'https://api.openai.com/v1/chat/completions');
        $this->apiKey ??= ($infra['api_key'] ?? null) ?: env('AI_API_KEY');
        $this->defaultModel ??= ($infra['model'] ?? null) ?: env('AI_MODEL', 'gpt-4o-mini');

        if (! $this->apiKey) {
            throw new RuntimeException('AI gateway is not configured: set AI_API_KEY');
        }
    }

    /** Raw chat completion. Returns the parsed JSON body. */
    public function chat(array $body): array
    {
        $payload = array_merge(['model' => $this->defaultModel], $body);
        $response = $this->post($payload);
        $this->throwOnError($response);

        return $response->json() ?? [];
    }

    /** Convenience: extract first message content as string. */
    public function chatText(array $messages, array $extra = []): string
    {
        $data = $this->chat(array_merge(['messages' => $messages], $extra));

        return (string) data_get($data, 'choices.0.message.content', '');
    }

    /**
     * JSON-mode chat. Parses {...} from the response. Falls back to $default on failure.
     */
    public function chatJson(array $messages, array $default = [], array $extra = []): array
    {
        $body = array_merge([
            'messages' => $messages,
            'response_format' => ['type' => 'json_object'],
        ], $extra);

        $content = $this->chatText($messages, $body);

        return $this->extractJson($content) ?? $default;
    }

    /**
     * Forced tool-call. Returns parsed arguments of the first tool call, or [].
     */
    public function chatToolCall(array $messages, string $toolName, array $parameters, array $extra = []): array
    {
        $tools = [[
            'type' => 'function',
            'function' => [
                'name' => $toolName,
                'parameters' => $parameters,
            ],
        ]];

        $body = array_merge([
            'messages' => $messages,
            'tools' => $tools,
            'tool_choice' => ['type' => 'function', 'function' => ['name' => $toolName]],
        ], $extra);

        $data = $this->chat($body);
        $args = data_get($data, 'choices.0.message.tool_calls.0.function.arguments');

        if (! $args) {
            return [];
        }

        try {
            $decoded = json_decode($args, true, 512, JSON_THROW_ON_ERROR);
            return is_array($decoded) ? $decoded : [];
        } catch (\JsonException $e) {
            Log::warning('AI tool_call args parse failed', ['error' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * Streaming chat completion (SSE). Returns a Symfony StreamedResponse that
     * proxies the upstream event-stream byte-for-byte to the client.
     */
    public function streamChat(array $body): StreamedResponse
    {
        $payload = array_merge(['model' => $this->defaultModel, 'stream' => true], $body);

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

    protected function post(array $payload): Response
    {
        return Http::withHeaders([
            'Authorization' => 'Bearer ' . $this->apiKey,
            'Content-Type' => 'application/json',
        ])->timeout(120)->post($this->apiUrl, $payload);
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
        Log::error('AI gateway error', ['status' => $status, 'body' => $response->body()]);
        throw new AiGatewayException('Ошибка AI gateway', $status ?: 500);
    }

    protected function extractJson(string $content): ?array
    {
        $cleaned = preg_replace('/^```(?:json)?\s*|```$/im', '', trim($content));
        if (preg_match('/\{[\s\S]*\}/', $cleaned, $m)) {
            try {
                return json_decode($m[0], true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                return null;
            }
        }
        return null;
    }
}
