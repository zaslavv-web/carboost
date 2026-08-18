<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SecurityAudit;
use App\Support\Totp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Epic B3 — двухфакторная аутентификация (TOTP + резервные коды).
 *
 * Поток включения: setup → (сканирование QR) → confirm(code) → enabled.
 * Поток входа: /auth/login возвращает 2fa_required + challenge_token,
 * фронт вызывает /auth/2fa/challenge с кодом и получает обычный sanctum-токен.
 */
class TwoFactorController extends Controller
{
    private const CHALLENGE_TTL = 300; // 5 минут

    /** Есть ли у пользователя подтверждённая 2FA. */
    public static function isEnabledFor(string $userId): bool
    {
        try {
            return DB::table('user_two_factor')
                ->where('user_id', (string) $userId)
                ->where('enabled', true)
                ->exists();
        } catch (\Throwable) {
            return false;
        }
    }

    /** Создаёт одноразовый challenge для завершения входа. */
    public static function issueChallenge(User $user): string
    {
        $token = Str::random(64);
        Cache::put('2fa:challenge:' . hash('sha256', $token), (string) $user->getAuthIdentifier(), self::CHALLENGE_TTL);
        return $token;
    }

    /** GET /api/auth/2fa/status */
    public function status(Request $request): JsonResponse
    {
        $row = $this->row($this->userId($request));
        $codes = $row?->backup_codes ? json_decode($row->backup_codes, true) : [];
        return response()->json([
            'enabled'        => (bool) ($row->enabled ?? false),
            'pending'        => (bool) ($row && !$row->enabled),
            'confirmed_at'   => $row->confirmed_at ?? null,
            'backup_codes_left' => is_array($codes) ? count($codes) : 0,
        ]);
    }

    /** POST /api/auth/2fa/setup — генерирует секрет и otpauth-ссылку. */
    public function setup(Request $request): JsonResponse
    {
        $user = $request->user();
        $userId = $this->userId($request);
        if (!$userId) return response()->json(['message' => 'Не авторизован'], 401);

        $existing = $this->row($userId);
        if ($existing && $existing->enabled) {
            return response()->json(['message' => 'Двухфакторная аутентификация уже включена.'], 422);
        }

        $secret = Totp::generateSecret();
        if ($existing) {
            DB::table('user_two_factor')->where('user_id', $userId)->update([
                'secret' => $secret, 'enabled' => false, 'confirmed_at' => null, 'updated_at' => now(),
            ]);
        } else {
            DB::table('user_two_factor')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'secret' => $secret,
                'enabled' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'secret' => $secret,
            'otpauth_url' => Totp::provisioningUri($secret, (string) ($user->email ?? $userId)),
        ]);
    }

    /** POST /api/auth/2fa/confirm — подтверждает код и включает 2FA, выдавая резервные коды. */
    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|max:10']);
        $userId = $this->userId($request);
        $row = $this->row($userId);
        if (!$row) return response()->json(['message' => 'Сначала запустите настройку.'], 422);

        if (!Totp::verify($row->secret, $data['code'])) {
            return response()->json(['message' => 'Неверный код. Проверьте время на устройстве.'], 422);
        }

        $plainCodes = [];
        $hashes = [];
        for ($i = 0; $i < 10; $i++) {
            $c = strtoupper(Str::random(4) . '-' . Str::random(4));
            $plainCodes[] = $c;
            $hashes[] = Hash::make($c);
        }

        DB::table('user_two_factor')->where('user_id', $userId)->update([
            'enabled' => true,
            'confirmed_at' => now(),
            'backup_codes' => json_encode($hashes),
            'updated_at' => now(),
        ]);

        SecurityAudit::log([
            'company_id' => $this->companyId($userId), 'user_id' => $userId,
            'actor_email' => $request->user()?->email, 'event' => '2fa.enabled',
            'category' => 'auth', 'severity' => 'warning',
        ]);

        return response()->json(['ok' => true, 'backup_codes' => $plainCodes]);
    }

    /** POST /api/auth/2fa/disable — требует текущий код или резервный. */
    public function disable(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|max:16']);
        $userId = $this->userId($request);
        $row = $this->row($userId);
        if (!$row || !$row->enabled) return response()->json(['ok' => true]);

        if (!Totp::verify($row->secret, $data['code']) && !$this->consumeBackupCode($row, $data['code'])) {
            return response()->json(['message' => 'Неверный код.'], 422);
        }

        DB::table('user_two_factor')->where('user_id', $userId)->delete();

        SecurityAudit::log([
            'company_id' => $this->companyId($userId), 'user_id' => $userId,
            'actor_email' => $request->user()?->email, 'event' => '2fa.disabled',
            'category' => 'auth', 'severity' => 'critical',
        ]);
        return response()->json(['ok' => true]);
    }

    /** POST /api/auth/2fa/challenge — публичный: завершение входа. */
    public function challenge(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_token' => 'required|string|max:200',
            'code'            => 'required|string|max:16',
        ]);

        $key = '2fa:challenge:' . hash('sha256', $data['challenge_token']);
        $userId = Cache::get($key);
        if (!$userId) {
            return response()->json(['message' => 'Сессия подтверждения истекла. Войдите заново.'], 422);
        }

        $row = $this->row((string) $userId);
        if (!$row || !$row->enabled) {
            return response()->json(['message' => 'Двухфакторная аутентификация не настроена.'], 422);
        }

        $ok = Totp::verify($row->secret, $data['code']) || $this->consumeBackupCode($row, $data['code']);
        if (!$ok) {
            SecurityAudit::log([
                'company_id' => $this->companyId((string) $userId), 'user_id' => $userId,
                'event' => '2fa.failed', 'category' => 'auth', 'severity' => 'warning',
            ]);
            return response()->json(['message' => 'Неверный код подтверждения.'], 422);
        }

        Cache::forget($key);
        DB::table('user_two_factor')->where('user_id', $userId)->update(['last_used_at' => now(), 'updated_at' => now()]);

        $user = User::find($userId);
        if (!$user) return response()->json(['message' => 'Пользователь не найден.'], 404);

        $token = $user->createToken('spa')->plainTextToken;

        SecurityAudit::log([
            'company_id' => $this->companyId((string) $userId), 'user_id' => $userId,
            'actor_email' => $user->email, 'event' => 'login.2fa.success',
            'category' => 'auth', 'severity' => 'info',
        ]);

        return response()->json([
            'user'  => app(\App\Http\Controllers\Api\Auth\AuthController::class)->presentUser($user),
            'token' => $token,
        ]);
    }

    // ---------- helpers ----------

    private function consumeBackupCode(object $row, string $code): bool
    {
        $codes = $row->backup_codes ? json_decode($row->backup_codes, true) : [];
        if (!is_array($codes) || !$codes) return false;
        $code = strtoupper(trim($code));
        foreach ($codes as $i => $hash) {
            if (Hash::check($code, $hash)) {
                unset($codes[$i]);
                DB::table('user_two_factor')->where('user_id', $row->user_id)
                    ->update(['backup_codes' => json_encode(array_values($codes)), 'updated_at' => now()]);
                return true;
            }
        }
        return false;
    }

    private function row(?string $userId): ?object
    {
        if (!$userId) return null;
        return DB::table('user_two_factor')->where('user_id', $userId)->first();
    }

    private function userId(Request $request): ?string
    {
        $u = $request->user();
        return $u ? (string) $u->getAuthIdentifier() : null;
    }

    private function companyId(?string $userId): ?string
    {
        if (!$userId) return null;
        try {
            return DB::table('profiles')->where('user_id', $userId)->value('company_id');
        } catch (\Throwable) {
            return null;
        }
    }
}
