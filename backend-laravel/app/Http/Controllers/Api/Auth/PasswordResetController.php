<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Support\RuntimeEnv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Events\PasswordReset;

/**
 * Phase 13: Forgot/Reset password endpoints. Заменяет
 * supabase.auth.resetPasswordForEmail + supabase.auth.updateUser({password}).
 *
 * Использует встроенный Laravel password broker — никаких внешних зависимостей.
 * Шаблон письма: resources/views/emails/reset.blade.php (см. ниже).
 */
class PasswordResetController extends Controller
{
    /** POST /api/auth/forgot-password { email, redirectTo? } */
    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'      => ['required', 'email'],
            'redirectTo' => ['nullable', 'string', 'url'],
        ]);

        // Запоминаем redirectTo в кэше на 1 час, чтобы письмо знало куда вести
        if (!empty($data['redirectTo'])) {
            cache()->put('pwd_reset_redirect:'.strtolower($data['email']), $data['redirectTo'], 3600);
        }

        RuntimeEnv::applyMailConfig();

        try {
            $status = Password::sendResetLink(['email' => strtolower($data['email'])]);
        } catch (\Throwable $e) {
            Log::error('password reset email failed', [
                'email' => strtolower($data['email']),
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'ok' => false,
                'status' => 'mail_send_failed',
                'message' => app()->isProduction()
                    ? 'Не удалось отправить письмо для сброса пароля. Попробуйте позже.'
                    : $e->getMessage(),
            ], 500);
        }

        // Не раскрываем существует ли email — всегда 200.
        return response()->json(['ok' => true, 'status' => $status]);
    }

    /** POST /api/auth/reset-password { token, email, password } */
    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token'    => ['required', 'string'],
            'email'    => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed:password_confirmation'],
        ]);

        $status = Password::reset(
            [
                'email'                 => strtolower($data['email']),
                'password'              => $data['password'],
                'password_confirmation' => $data['password'],
                'token'                 => $data['token'],
            ],
            function ($user, $password) {
                $user->forceFill(['password' => Hash::make($password)])->save();
                // Сбрасываем все Sanctum-токены — старые сессии больше не валидны
                if (method_exists($user, 'tokens')) {
                    $user->tokens()->delete();
                }
                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => __($status),
            ]);
        }

        return response()->json(['ok' => true]);
    }
}
