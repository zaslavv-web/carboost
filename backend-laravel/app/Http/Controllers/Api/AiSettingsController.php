<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AI\AiGatewayService;
use App\Services\AI\AiSettingsResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Настройки AI-провайдера для компании. Доступ: Superadmin (любая компания),
 * Company Admin / HRD (только своя компания).
 */
class AiSettingsController extends Controller
{
    public function show(Request $request, AiSettingsResolver $resolver)
    {
        $user = Auth::user();
        if (! $user) return response()->json(['error' => 'Unauthorized'], 401);

        $companyId = $this->companyId($request, $user);
        $row = DB::table('ai_settings')->where('company_id', $companyId)->first();
        if (! $row && $this->isSuperadmin($user)) {
            $row = DB::table('ai_settings')->whereNull('company_id')->first();
        }

        return response()->json($this->presenter($row));
    }

    public function update(Request $request, AiSettingsResolver $resolver)
    {
        $user = Auth::user();
        if (! $user) return response()->json(['error' => 'Unauthorized'], 401);

        $data = $request->validate([
            'provider' => 'required|string|in:gemini,yandexgpt,gigachat,openai_compatible,internal_rag,disabled',
            'model' => 'nullable|string|max:128',
            'api_url' => 'nullable|string|max:512',
            'api_key' => 'nullable|string|max:4096',
            'extra' => 'nullable|array',
            'rag_enabled' => 'nullable|boolean',
            'disabled_message' => 'nullable|string|max:2000',
            'disabled_alert_threshold' => 'nullable|integer|min:1|max:10000',
        ]);

        $companyId = $this->companyId($request, $user);
        $row = DB::table('ai_settings')->where('company_id', $companyId)->first();

        $payload = [
            'provider' => $data['provider'],
            'model' => $data['model'] ?? null,
            'api_url' => $data['api_url'] ?? null,
            'extra' => isset($data['extra']) ? json_encode($data['extra'], JSON_UNESCAPED_UNICODE) : null,
            'rag_enabled' => (bool) ($data['rag_enabled'] ?? false),
            'disabled_message' => $data['disabled_message'] ?? null,
            'disabled_alert_threshold' => (int) ($data['disabled_alert_threshold'] ?? 10),
            'updated_at' => now(),
        ];

        // api_key: если пришёл новый — шифруем, иначе оставляем как есть
        if (! empty($data['api_key'])) {
            $payload['api_key_enc'] = Crypt::encryptString($data['api_key']);
        }

        if ($row) {
            DB::table('ai_settings')->where('id', $row->id)->update($payload);
        } else {
            DB::table('ai_settings')->insert(array_merge($payload, [
                'company_id' => $companyId,
                'created_at' => now(),
            ]));
        }

        $row = DB::table('ai_settings')->where('company_id', $companyId)->first();
        return response()->json($this->presenter($row));
    }

    /** Пробный вызов с минимальным промптом — проверка работоспособности конфигурации. */
    public function test(Request $request, AiSettingsResolver $resolver)
    {
        $user = Auth::user();
        if (! $user) return response()->json(['error' => 'Unauthorized'], 401);

        try {
            $companyId = $this->companyId($request, $user);
            $r = $resolver->resolve($companyId);
            $driver = $r['driver'];

            $start = microtime(true);
            $result = $driver->chat([
                ['role' => 'system', 'content' => 'Ответь строго: PONG'],
                ['role' => 'user', 'content' => 'ping'],
            ], ['max_tokens' => 16, 'temperature' => 0]);

            $latency = (int) ((microtime(true) - $start) * 1000);
            $text = (string) data_get($result, 'choices.0.message.content', '');

            return response()->json([
                'ok' => true,
                'provider' => $driver->name(),
                'latency_ms' => $latency,
                'response_preview' => mb_substr($text, 0, 200),
            ]);
        } catch (\App\Services\AI\AiDisabledException $e) {
            return response()->json(['ok' => false, 'disabled' => true, 'error' => $e->getMessage()], 423);
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'error' => $e->getMessage()], 200);
        }
    }

    protected function companyId(Request $request, $user): ?string
    {
        // Superadmin может явно указать company_id в query (для глобальных fallback — null)
        if ($this->isSuperadmin($user)) {
            return $request->query('company_id') ?: ($user->company_id ?: null);
        }
        return $user->company_id ?: null;
    }

    protected function isSuperadmin($user): bool
    {
        try { return $user && method_exists($user, 'hasRole') && $user->hasRole('superadmin'); }
        catch (\Throwable) { return false; }
    }

    protected function presenter(?object $row): array
    {
        if (! $row) {
            return [
                'provider' => 'gemini',
                'model' => null,
                'api_url' => null,
                'api_key_set' => false,
                'extra' => [],
                'rag_enabled' => false,
                'rag_index_status' => 'idle',
                'disabled_message' => null,
                'disabled_alert_threshold' => 10,
                'disabled_request_count' => 0,
            ];
        }
        $extra = $row->extra;
        if (is_string($extra)) {
            $decoded = json_decode($extra, true);
            $extra = is_array($decoded) ? $decoded : [];
        }
        return [
            'provider' => $row->provider,
            'model' => $row->model,
            'api_url' => $row->api_url,
            'api_key_set' => ! empty($row->api_key_enc),
            'extra' => $extra ?: [],
            'rag_enabled' => (bool) $row->rag_enabled,
            'rag_index_status' => $row->rag_index_status,
            'disabled_message' => $row->disabled_message,
            'disabled_alert_threshold' => (int) $row->disabled_alert_threshold,
            'disabled_request_count' => (int) $row->disabled_request_count,
        ];
    }
}
