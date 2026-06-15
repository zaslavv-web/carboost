<?php

namespace App\Services\AI;

use App\Services\AI\Drivers\DisabledDriver;
use App\Services\AI\Drivers\GigaChatDriver;
use App\Services\AI\Drivers\LlmDriverInterface;
use App\Services\AI\Drivers\OpenAICompatibleDriver;
use App\Services\AI\Drivers\YandexGptDriver;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Резолвер настроек AI: по company_id текущего пользователя возвращает строку
 * конфигурации и собирает соответствующий драйвер.
 *
 * Если для компании ничего не настроено — fallback на глобальные (company_id=null),
 * далее — на env (AI_API_URL/AI_API_KEY/AI_MODEL).
 */
class AiSettingsResolver
{
    /** @return array{settings:?object,driver:LlmDriverInterface} */
    public function resolve(?string $companyId = null): array
    {
        $companyId = $companyId ?: $this->currentCompanyId();
        $row = null;

        if ($companyId) {
            $row = DB::table('ai_settings')->where('company_id', $companyId)->first();
        }
        if (! $row) {
            $row = DB::table('ai_settings')->whereNull('company_id')->first();
        }

        return ['settings' => $row, 'driver' => $this->buildDriver($row)];
    }

    public function buildDriver(?object $row): LlmDriverInterface
    {
        $provider = $row->provider ?? null;

        // Fallback на env, если в БД ничего нет
        if (! $row) {
            $infra = \App\Support\ServiceInfra::ai();
            $apiUrl = ($infra['url'] ?? null) ?: env('AI_API_URL', 'https://api.openai.com/v1/chat/completions');
            $apiKey = ($infra['api_key'] ?? null) ?: env('AI_API_KEY', '');
            $model  = ($infra['model'] ?? null) ?: env('AI_MODEL', 'gpt-4o-mini');
            return new OpenAICompatibleDriver($apiUrl, (string) $apiKey, (string) $model, 'gemini');
        }

        $apiKey = $row->api_key_enc ? $this->decrypt($row->api_key_enc) : '';
        $extra = $this->extra($row);
        $model = (string) ($row->model ?? '');
        $apiUrl = (string) ($row->api_url ?? '');

        return match ($provider) {
            'disabled' => new DisabledDriver((string) ($row->disabled_message ?: 'AI отключён администратором продукта')),
            'yandexgpt' => new YandexGptDriver(
                $apiUrl ?: 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
                $apiKey, $model ?: 'yandexgpt-lite', $extra
            ),
            'gigachat' => new GigaChatDriver(
                $apiUrl ?: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
                $apiKey, $model ?: 'GigaChat', $extra
            ),
            'openai_compatible', 'internal_rag' => new OpenAICompatibleDriver(
                $apiUrl, $apiKey, $model ?: 'gpt-4o-mini', $provider, $extra
            ),
            default => new OpenAICompatibleDriver(
                $apiUrl ?: (string) env('AI_API_URL', 'https://api.openai.com/v1/chat/completions'),
                $apiKey ?: (string) env('AI_API_KEY', ''),
                $model ?: (string) env('AI_MODEL', 'gpt-4o-mini'),
                'gemini', $extra
            ),
        };
    }

    public function currentCompanyId(): ?string
    {
        try {
            $u = Auth::user();
            return $u?->company_id ? (string) $u->company_id : null;
        } catch (\Throwable) { return null; }
    }

    protected function decrypt(string $value): string
    {
        try { return Crypt::decryptString($value); } catch (\Throwable) { return ''; }
    }

    /** @return array<string,mixed> */
    public function extra(?object $row): array
    {
        if (! $row || empty($row->extra)) return [];
        if (is_array($row->extra)) return $row->extra;
        $decoded = json_decode((string) $row->extra, true);
        return is_array($decoded) ? $decoded : [];
    }
}
