<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailSetting;
use App\Services\EmailConfigService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class EmailSettingsController extends Controller
{
    public function __construct(private EmailConfigService $mail) {}

    public function index(Request $request): JsonResponse
    {
        $this->ensureSuperadmin($request);

        return response()->json([
            'setting' => $this->present($this->mail->active()),
            'presets' => EmailConfigService::PRESETS,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->ensureSuperadmin($request);

        $setting = $this->mail->active();
        $data = $request->validate([
            'provider' => ['required', 'string', Rule::in(array_keys(EmailConfigService::PRESETS))],
            'host' => ['required', 'string', 'max:255'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'encryption' => ['nullable', 'string', Rule::in(['ssl', 'tls', 'none'])],
            'username' => ['required', 'string', 'max:255'],
            'password' => [$setting && $setting->password_encrypted ? 'nullable' : 'required', 'nullable', 'string', 'max:2048'],
            'from_address' => ['required', 'email', 'max:255'],
            'from_name' => ['required', 'string', 'max:255'],
            'reply_to_address' => ['nullable', 'email', 'max:255'],
            'is_active' => ['boolean'],
        ]);

        return DB::transaction(function () use ($request, $setting, $data) {
            if (($data['is_active'] ?? true) === true) {
                EmailSetting::query()->update(['is_active' => false]);
            }

            $host = EmailConfigService::normalizeHost($data['host'], $data['provider']);
            $port = EmailConfigService::normalizePort($host, $data['port'], $data['provider']);
            $encryption = EmailConfigService::normalizeEncryption($host, $port, $data['encryption'] ?? null);
            $username = EmailConfigService::normalizeUsername($host, $data['username'], $data['from_address']);

            $setting ??= new EmailSetting();
            $setting->fill([
                'provider' => $data['provider'],
                'host' => $host,
                'port' => $port,
                'encryption' => $encryption,
                'username' => $username ?: '',
                'from_address' => strtolower($data['from_address']),
                'from_name' => $data['from_name'],
                'reply_to_address' => isset($data['reply_to_address']) && $data['reply_to_address'] !== ''
                    ? strtolower($data['reply_to_address'])
                    : null,
                'is_active' => (bool) ($data['is_active'] ?? true),
                'created_by' => $setting->exists ? $setting->created_by : (string) $request->user()->id,
            ]);

            if (!empty($data['password'])) {
                $setting->password = EmailConfigService::normalizePassword($host, $data['password'], $data['provider']);
            }

            $setting->save();

            return response()->json(['setting' => $this->present($setting->fresh())]);
        });
    }

    public function test(Request $request): JsonResponse
    {
        $this->ensureSuperadmin($request);

        $data = $request->validate([
            'to' => ['required', 'email', 'max:255'],
        ]);

        $setting = $this->mail->autoRepairActiveSettings();
        if (!$setting) {
            return response()->json(['error' => 'Сначала сохраните активные SMTP-настройки'], 422);
        }

        try {
            $this->mail->sendTest($setting, strtolower($data['to']));
            $setting->forceFill([
                'last_tested_at' => now(),
                'last_test_error' => null,
            ])->save();

            return response()->json(['ok' => true, 'setting' => $this->present($setting->fresh())]);
        } catch (\Throwable $e) {
            $message = $this->localizeMailError($e->getMessage());
            $setting->forceFill([
                'last_tested_at' => now(),
                'last_test_error' => $message,
            ])->save();
            Log::warning('SMTP test failed', ['err' => $e->getMessage()]);

            return response()->json(['error' => $message, 'setting' => $this->present($setting->fresh())], 422);
        }
    }

    /**
     * Preflight: открыть SMTP-соединение и выполнить AUTH без отправки письма.
     */
    public function preflight(Request $request): JsonResponse
    {
        $this->ensureSuperadmin($request);

        $this->mail->autoRepairActiveSettings();
        $this->mail->apply();
        $result = $this->mail->preflightSafe();

        if (!($result['ok'] ?? false)) {
            $result['error'] = $this->localizeMailError($result['error'] ?? '');
            return response()->json($result, 422);
        }

        return response()->json($result);
    }



    public function activate(Request $request): JsonResponse
    {
        $this->ensureSuperadmin($request);
        $data = $request->validate(['id' => ['required', 'string', 'exists:email_settings,id']]);

        return DB::transaction(function () use ($data) {
            EmailSetting::query()->update(['is_active' => false]);
            $setting = EmailSetting::findOrFail($data['id']);
            $setting->forceFill(['is_active' => true])->save();

            return response()->json(['setting' => $this->present($setting->fresh())]);
        });
    }

    private function ensureSuperadmin(Request $request): void
    {
        abort_unless($request->user()?->hasRole('superadmin'), 403, 'Доступно только суперадмину');
    }

    private function present(?EmailSetting $setting): ?array
    {
        if (!$setting) {
            return null;
        }

        return [
            'id' => $setting->id,
            'provider' => $setting->provider,
            'host' => $setting->host,
            'port' => $setting->port,
            'encryption' => $setting->encryption ?: 'none',
            'username' => $setting->username,
            'from_address' => $setting->from_address,
            'from_name' => $setting->from_name,
            'reply_to_address' => $setting->reply_to_address,
            'is_active' => (bool) $setting->is_active,
            'has_password' => (bool) $setting->password_encrypted,
            'last_tested_at' => optional($setting->last_tested_at)->toISOString(),
            'last_test_error' => $setting->last_test_error,
            'updated_at' => optional($setting->updated_at)->toISOString(),
        ];
    }

    private function localizeMailError(string $message): string
    {
        if (preg_match('/authentication|auth|login|password|535|534/i', $message)) {
            return 'SMTP-сервер отклонил логин или пароль. Типовые SMTP-поля автоисправлены; если ошибка осталась — сохраните новый пароль приложения от этого же ящика.';
        }
        if (preg_match('/неполные|расшифровывается|Сохраните SMTP-пароль/i', $message)) {
            return 'Активные SMTP-настройки неполные или старый пароль невозможно прочитать. Сохраните SMTP-пароль заново и повторите проверку.';
        }
        if (preg_match('/connection|timed out|refused|could not connect|network/i', $message)) {
            return 'Не удалось подключиться к SMTP-серверу. Проверьте host, port и шифрование: для Яндекс.Почты smtp.yandex.ru, 465, ssl.';
        }
        if (preg_match('/sender|from|relay|verified/i', $message)) {
            return 'SMTP-сервер отклонил отправителя. Проверьте From address и разрешения домена.';
        }

        return 'Не удалось отправить тестовое письмо: ' . $message;
    }
}
