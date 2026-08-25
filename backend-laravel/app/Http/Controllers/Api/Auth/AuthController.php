<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private AuthUserService $users) {}

    /** POST /api/auth/register */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'          => ['required', 'email', 'max:255'],
            'password'       => ['required', 'string', 'min:8'],
            'full_name'      => ['required', 'string', 'max:255'],
            'requested_role' => ['nullable', 'in:employee,manager,hrd,company_admin'],
        ]);

        // Проверка уникальности email в таблице users
        $exists = DB::table('users')->where('email', strtolower($data['email']))->exists();
        if ($exists) {
            throw ValidationException::withMessages([
                'email' => 'Пользователь с таким email уже существует',
            ]);
        }

        $user = $this->users->createWithPassword(
            $data['email'],
            $data['password'],
            $data['full_name'],
            $data['requested_role'] ?? 'employee'
        );

        $token = $user->createToken('spa')->plainTextToken;

        return response()->json([
            'user'  => $this->presentUser($user),
            'token' => $token,
        ], 201);
    }

    /** POST /api/auth/login */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();

        $passwordMatches = false;
        if ($user && $user->password) {
            try {
                $passwordMatches = Hash::check($data['password'], $user->password);
            } catch (\RuntimeException $e) {
                Log::warning('Auth login rejected because stored password hash is invalid', [
                    'user_id' => $user->id,
                    'email'   => $user->email,
                    'reason'  => $e->getMessage(),
                ]);
            }
        } elseif ($user && empty($user->password)) {
            return response()->json([
                'message' => 'Этот аккаунт зарегистрирован через Google. Войдите через кнопку "Google" или задайте пароль через "Забыли пароль?".',
                'errors' => [
                    'email' => ['Этот аккаунт зарегистрирован через Google. Войдите через кнопку "Google" или задайте пароль через "Забыли пароль?".'],
                ],
                'code' => 'oauth_only',
                'provider' => 'google',
            ], 422);
        }

        if (!$user || !$passwordMatches) {
            throw ValidationException::withMessages([
                'email' => 'Неверный email или пароль',
            ]);
        }

        try {
            $this->users->repairDomainRowsForLogin($user);
            $user = $user->refresh();
        } catch (\Throwable $e) {
            Log::warning('Auth login domain repair skipped', [
                'user_id' => $user->id,
                'email'   => $user->email,
                'reason'  => $e->getMessage(),
            ]);
        }

        // Epic B3 — если включена 2FA, вместо токена отдаём challenge.
        try {
            $domainId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
            if (\App\Http\Controllers\Api\TwoFactorController::isEnabledFor((string) $domainId)
                || \App\Http\Controllers\Api\TwoFactorController::isEnabledFor((string) $user->id)) {
                return response()->json([
                    '2fa_required'    => true,
                    'challenge_token' => \App\Http\Controllers\Api\TwoFactorController::issueChallenge($user),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('2FA check skipped', ['reason' => $e->getMessage()]);
        }

        $token = $user->createToken('spa')->plainTextToken;

        \App\Services\SecurityAudit::log([
            'company_id'  => DB::table('profiles')->where('user_id', method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id)->value('company_id'),
            'user_id'     => $user->id,
            'actor_email' => $user->email,
            'event'       => 'login.success',
            'category'    => 'auth',
        ]);

        return response()->json([
            'user'  => $this->presentUser($user),
            'token' => $token,
        ]);
    }

    /** POST /api/auth/logout (auth:sanctum) */
    public function logout(Request $request): JsonResponse
    {
        // При сессионной аутентификации (или TransientToken) активного токена нет —
        // logout не должен падать 500.
        $token = $request->user()?->currentAccessToken();
        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }
        return response()->json(['ok' => true]);
    }

    /**
     * GET /api/auth/me — публичный роут.
     * Сам читает sanctum-токен; нет токена или ошибка — 401 JSON (а не 500).
     * Также применяет impersonation вручную (т.к. вне effective.user middleware).
     */
    public function me(Request $request): JsonResponse
    {
        try {
            $user = \Auth::guard('sanctum')->user();
            if (!$user) {
                return response()->json(['message' => 'Не авторизован'], 401);
            }
            // Применяем impersonation вручную (роут вне effective.user группы)
            $token    = $user->currentAccessToken();
            $targetId = $token ? \App\Services\ImpersonationService::targetFromToken($token) : null;
            if ($targetId) {
                $target = User::find($targetId);
                if ($target) $user = $target;
            }
            return response()->json($this->presentUser($user));
        } catch (QueryException $e) {
            Log::warning('auth/me database unavailable', ['error' => $e->getMessage()]);
            try { DB::disconnect(); } catch (\Throwable) {}
            return response()->json([
                'message'    => 'База данных временно перегружена. Повторите через несколько секунд.',
                'error_code' => 'db_busy',
            ], 503)->header('Retry-After', '3');
        } catch (\Throwable $e) {
            Log::error('auth/me failed', ['error' => $e->getMessage(), 'class' => $e::class]);
            return response()->json(['message' => 'Не авторизован', 'code' => 'me_failed'], 401);
        }
    }

    public function presentUser(User $user): array
    {
        $domainUserId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
        $profile = null;
        $roles = [];

        try {
            $profile = DB::table('profiles')->where('user_id', $domainUserId)->first();
            $roles = DB::table('user_roles')
                ->where('user_id', $domainUserId)
                ->pluck('role')
                ->map(fn ($role) => (string) $role)
                ->values()
                ->all();
        } catch (QueryException $e) {
            if ($this->isDatabaseBusy($e)) {
                throw $e;
            }
            Log::warning('presentUser domain data unavailable', [
                'user_id' => $user->id,
                'domain_user_id' => $domainUserId,
                'error' => $e->getMessage(),
            ]);
        }

        return [
            'id'             => $domainUserId,
            'auth_id'        => $user->id,
            'email'          => $user->email,
            'email_verified' => (bool) $user->email_verified_at,
            'full_name'      => $profile->full_name       ?? null,
            'avatar_url'     => $profile->avatar_url      ?? ($user->meta['avatar_url'] ?? null),
            'company_id'     => $profile->company_id      ?? null,
            'is_verified'    => (bool) ($profile->is_verified ?? false),
            'requested_role' => $profile->requested_role  ?? null,
            'role'           => $roles[0] ?? null,
            'roles'          => $roles,
            'meta'           => $user->meta,
        ];
    }

    private function isDatabaseBusy(QueryException $e): bool
    {
        return (bool) preg_match(
            '/max_user_connections|max_connections_per_hour|Too many connections|too many clients|SQLSTATE\[0800[46]\]|server has gone away|Connection refused/i',
            $e->getMessage(),
        );
    }
}
