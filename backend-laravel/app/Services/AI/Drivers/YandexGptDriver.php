<?php

namespace App\Services\AI\Drivers;

use App\Services\AI\AiGatewayException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * YandexGPT (Yandex Cloud Foundation Models).
 * Документация: https://cloud.yandex.ru/docs/foundation-models/concepts/yandexgpt/
 *
 * extra:
 *   folder_id (required) — каталог Яндекс Облака
 *   auth_type: 'api_key' | 'iam' (default: api_key)
 */
class YandexGptDriver implements LlmDriverInterface
{
    public function __construct(
        protected string $apiUrl,   // https://llm.api.cloud.yandex.net/foundationModels/v1/completion
        protected string $apiKey,
        protected string $defaultModel, // например, 'yandexgpt' | 'yandexgpt-lite' | 'yandexgpt-32k'
        protected array $extra = [],
    ) {}

    public function name(): string { return 'yandexgpt'; }

    public function chat(array $messages, array $options = []): array
    {
        $folderId = $this->extra['folder_id'] ?? '';
        if (! $folderId) {
            throw new AiGatewayException('YandexGPT: не задан folder_id', 500);
        }

        $modelShort = $options['model'] ?? $this->defaultModel;
        $modelUri = str_starts_with($modelShort, 'gpt://')
            ? $modelShort
            : "gpt://{$folderId}/{$modelShort}/latest";

        $payload = [
            'modelUri' => $modelUri,
            'completionOptions' => [
                'stream' => false,
                'temperature' => $options['temperature'] ?? ($this->extra['temperature'] ?? 0.3),
                'maxTokens' => (string) ($options['max_tokens'] ?? ($this->extra['max_tokens'] ?? 2000)),
            ],
            'messages' => array_map(fn ($m) => [
                'role' => $m['role'],
                'text' => is_string($m['content']) ? $m['content'] : json_encode($m['content'], JSON_UNESCAPED_UNICODE),
            ], $messages),
        ];

        $authType = $this->extra['auth_type'] ?? 'api_key';
        $authHeader = $authType === 'iam' ? 'Bearer ' . $this->apiKey : 'Api-Key ' . $this->apiKey;

        $response = Http::withHeaders([
            'Authorization' => $authHeader,
            'x-folder-id' => $folderId,
            'Content-Type' => 'application/json',
        ])->timeout(120)->post($this->apiUrl, $payload);

        if (! $response->successful()) {
            $status = $response->status();
            Log::error('YandexGPT error', ['status' => $status, 'body' => $response->body()]);
            throw new AiGatewayException('Ошибка YandexGPT: ' . $response->body(), $status ?: 500);
        }

        $body = $response->json() ?? [];
        $text = (string) data_get($body, 'result.alternatives.0.message.text', '');

        // Приводим к OpenAI-style
        return [
            'choices' => [[
                'message' => ['role' => 'assistant', 'content' => $text],
                'finish_reason' => data_get($body, 'result.alternatives.0.status', 'stop'),
            ]],
            'usage' => [
                'prompt_tokens' => (int) data_get($body, 'result.usage.inputTextTokens', 0),
                'completion_tokens' => (int) data_get($body, 'result.usage.completionTokens', 0),
                'total_tokens' => (int) data_get($body, 'result.usage.totalTokens', 0),
            ],
        ];
    }

    public function stream(array $messages, array $options = []): StreamedResponse
    {
        // YandexGPT не отдаёт OpenAI-совместимый SSE. Делаем синхронный chat и
        // эмитим один data-chunk + [DONE], чтобы фронт работал единообразно.
        $result = $this->chat($messages, $options);
        $content = (string) data_get($result, 'choices.0.message.content', '');

        return new StreamedResponse(function () use ($content) {
            $chunk = [
                'choices' => [[
                    'delta' => ['role' => 'assistant', 'content' => $content],
                    'finish_reason' => 'stop',
                ]],
            ];
            echo 'data: ' . json_encode($chunk, JSON_UNESCAPED_UNICODE) . "\n\n";
            echo "data: [DONE]\n\n";
            @ob_flush();
            @flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
