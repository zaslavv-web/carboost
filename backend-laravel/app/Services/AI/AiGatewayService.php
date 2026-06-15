<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Crypt;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Центральный фасад работы с AI. Делегирует вызовы в активный драйвер,
 * определяемый AiSettingsResolver для company_id текущего пользователя.
 *
 * Сохраняет публичный API (chat / chatText / chatJson / chatToolCall / streamChat),
 * чтобы существующие сервисы (AssessmentChat, GenerateClosedTest, ...) работали без изменений.
 *
 * Дополнительно:
 *  - при провайдере 'disabled' ведёт счётчик обращений и отправляет уведомление
 *    Company Admin / HRD когда достигнут disabled_alert_threshold;
 *  - логирует каждое обращение в ai_usage_log.
 */
class AiGatewayService
{
    public function __construct(
        protected ?AiSettingsResolver $resolver = null,
        protected ?string $feature = null,
    ) {
        $this->resolver ??= app(AiSettingsResolver::class);
    }

    public function forFeature(string $feature): self
    {
        $clone = clone $this;
        $clone->feature = $feature;
        return $clone;
    }

    public function chat(array $body): array
    {
        [$row, $driver] = $this->load();
        $messages = $body['messages'] ?? [];
        $options = array_diff_key($body, ['messages' => true]);

        return $this->run($row, $driver, fn () => $driver->chat($messages, $options));
    }

    public function chatText(array $messages, array $extra = []): string
    {
        $data = $this->chat(array_merge(['messages' => $messages], $extra));
        return (string) data_get($data, 'choices.0.message.content', '');
    }

    public function chatJson(array $messages, array $default = [], array $extra = []): array
    {
        $body = array_merge([
            'messages' => $messages,
            'response_format' => ['type' => 'json_object'],
        ], $extra);

        $content = (string) data_get($this->chat($body), 'choices.0.message.content', '');
        return $this->extractJson($content) ?? $default;
    }

    public function chatToolCall(array $messages, string $toolName, array $parameters, array $extra = []): array
    {
        $tools = [[
            'type' => 'function',
            'function' => ['name' => $toolName, 'parameters' => $parameters],
        ]];

        $body = array_merge([
            'messages' => $messages,
            'tools' => $tools,
            'tool_choice' => ['type' => 'function', 'function' => ['name' => $toolName]],
        ], $extra);

        $data = $this->chat($body);
        $args = data_get($data, 'choices.0.message.tool_calls.0.function.arguments');

        if (! $args) {
            // Не все провайдеры поддерживают tool_calls (YandexGPT). Падаем в JSON-режим.
            $content = (string) data_get($data, 'choices.0.message.content', '');
            return $this->extractJson($content) ?? [];
        }

        try {
            $decoded = json_decode($args, true, 512, JSON_THROW_ON_ERROR);
            return is_array($decoded) ? $decoded : [];
        } catch (\JsonException $e) {
            Log::warning('AI tool_call args parse failed', ['error' => $e->getMessage()]);
            return [];
        }
    }

    public function streamChat(array $body): StreamedResponse
    {
        [$row, $driver] = $this->load();
        $messages = $body['messages'] ?? [];
        $options = array_diff_key($body, ['messages' => true]);

        return $this->run($row, $driver, fn () => $driver->stream($messages, $options));
    }

    /** @return array{0:?object,1:\App\Services\AI\Drivers\LlmDriverInterface} */
    protected function load(): array
    {
        $r = $this->resolver->resolve();
        return [$r['settings'], $r['driver']];
    }

    protected function run(?object $row, $driver, \Closure $action)
    {
        $started = microtime(true);
        $companyId = $row->company_id ?? $this->resolver->currentCompanyId();
        $userId = Auth::id();
        $isDisabled = ($row->provider ?? null) === 'disabled';

        try {
            $result = $action();

            $this->log($companyId, $userId, $row?->provider, $isDisabled, $started, 'ok');
            return $result;
        } catch (AiDisabledException $e) {
            $this->log($companyId, $userId, $row?->provider, true, $started, 'disabled', $e->getMessage());
            $this->bumpDisabledCounter($row);
            throw $e;
        } catch (\Throwable $e) {
            $this->log($companyId, $userId, $row?->provider, $isDisabled, $started, 'error', $e->getMessage());
            throw $e;
        }
    }

    protected function log(?string $companyId, $userId, ?string $provider, bool $wasDisabled, float $started, string $status, ?string $error = null): void
    {
        try {
            DB::table('ai_usage_log')->insert([
                'company_id' => $companyId,
                'user_id' => $userId,
                'feature' => $this->feature ?? 'unknown',
                'provider' => $provider,
                'was_disabled' => $wasDisabled,
                'latency_ms' => (int) ((microtime(true) - $started) * 1000),
                'status' => $status,
                'error' => $error ? mb_substr($error, 0, 2000) : null,
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) { /* не блокируем бизнес-операцию */ }
    }

    /**
     * Увеличивает счётчик обращений к выключенному AI. При достижении порога
     * шлёт push-уведомление Company Admin/HRD и сбрасывает счётчик.
     */
    protected function bumpDisabledCounter(?object $row): void
    {
        if (! $row || (int) ($row->disabled_alert_threshold ?? 0) <= 0) return;

        try {
            $newCount = ((int) ($row->disabled_request_count ?? 0)) + 1;
            DB::table('ai_settings')->where('id', $row->id)->update([
                'disabled_request_count' => $newCount,
                'updated_at' => now(),
            ]);

            if ($newCount >= (int) $row->disabled_alert_threshold) {
                $this->notifyAdmins($row);
                DB::table('ai_settings')->where('id', $row->id)->update([
                    'disabled_request_count' => 0,
                    'disabled_last_alert_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('AI disabled counter failed', ['error' => $e->getMessage()]);
        }
    }

    protected function notifyAdmins(object $row): void
    {
        if (! $row->company_id) return;

        try {
            $adminIds = DB::table('user_roles')
                ->where('role', 'company_admin')
                ->orWhere('role', 'hrd')
                ->pluck('user_id');

            $message = sprintf(
                'За последнее время пользователи %d раз обратились к AI-функциям, но AI отключён. Настройте интеграцию: /ai-settings',
                (int) $row->disabled_alert_threshold,
            );

            foreach ($adminIds as $uid) {
                DB::table('notifications')->insert([
                    'id' => (string) \Illuminate\Support\Str::uuid(),
                    'user_id' => $uid,
                    'title' => 'AI требует настройки',
                    'description' => $message,
                    'notification_type' => 'ai_disabled_threshold',
                    'is_read' => false,
                    'company_id' => $row->company_id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('AI notify admins failed', ['error' => $e->getMessage()]);
        }
    }

    protected function extractJson(string $content): ?array
    {
        $cleaned = preg_replace('/^```(?:json)?\s*|```$/im', '', trim($content));
        if (preg_match('/\{[\s\S]*\}/', $cleaned, $m)) {
            try {
                return json_decode($m[0], true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) { return null; }
        }
        return null;
    }
}
