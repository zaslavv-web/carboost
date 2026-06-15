<?php

namespace App\Services\AI\Drivers;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Единый интерфейс для всех LLM-провайдеров.
 * Драйвер скрывает специфику API (OpenAI-style, YandexGPT, GigaChat и т.д.)
 * и принимает универсальный формат сообщений [{role,content}].
 */
interface LlmDriverInterface
{
    /**
     * Синхронный chat completion.
     * @param  array<int,array{role:string,content:mixed}> $messages
     * @param  array<string,mixed> $options  model, temperature, max_tokens, tools, tool_choice, response_format
     * @return array<string,mixed>  OpenAI-style: {choices:[{message:{content,tool_calls}}], usage}
     */
    public function chat(array $messages, array $options = []): array;

    /**
     * Стриминговый chat completion (SSE), нормализованный под OpenAI-style chunks.
     */
    public function stream(array $messages, array $options = []): StreamedResponse;

    /** Уникальный код провайдера (gemini, yandexgpt, gigachat, openai_compatible, disabled). */
    public function name(): string;
}
