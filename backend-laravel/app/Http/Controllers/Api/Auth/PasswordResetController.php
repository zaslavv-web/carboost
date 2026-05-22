<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
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

        $mail = app(\App\Services\EmailConfigService::class);

        try {
            $mail->autoRepairActiveSettings();
            $mail->apply();
            $smtp = $mail->currentSmtpSummary();

            // Preflight: реальное SMTP-рукопожатие (TCP → EHLO → STARTTLS → AUTH).
            // Не подменяем сохранённые админом SMTP-настройки .env-фолбэком: иначе UI
            // показывает «активно», а восстановление может уйти через другие креды.
            $mail->preflight();

            $status = Password::sendResetLink(['email' => strtolower($data['email'])]);
        } catch (\Throwable $e) {
            if (\App\Services\EmailConfigService::isSmtpAuthFailure($e) && ! $mail->hasActiveStoredSettings()) {
                try {
                    Log::warning('Password reset SMTP auth failed, retrying with runtime env credentials', [
                        'email' => strtolower($data['email']),
                        'err' => $e->getMessage(),
                    ]);
                    $mail->applyRuntimeEnv();
                    $mail->preflight();
                    $status = Password::sendResetLink(['email' => strtolower($data['email'])]);
                } catch (\Throwable $retryException) {
                    Log::error('Password reset email runtime retry failed', ['email' => strtolower($data['email']), 'exception' => $retryException]);
                    return response()->json([
                        'error' => $this->localizeSmtpError($retryException->getMessage()),
                        'smtp' => $mail->currentSmtpSummary(),
                    ], 422);
                }
            } else {
                Log::error('Password reset email failed', ['email' => strtolower($data['email']), 'exception' => $e]);
                return response()->json([
                    'error' => $this->localizeSmtpError($e->getMessage()),
                    'smtp' => $smtp ?? $mail->currentSmtpSummary(),
                ], 422);
            }
        }

        // Не раскрываем существует ли email — всегда 200.
        return response()->json(['ok' => true, 'status' => $status]);
    }

    private function localizeSmtpError(string $message): string
    {
        if (preg_match('/authentication|535|534|invalid user or password|auth/i', $message)) {
            return 'SMTP-сервер отклонил логин или пароль. Типовые SMTP-поля автоисправлены; если ошибка осталась — сохраните новый пароль приложения от этого же ящика.';
        }
        if (preg_match('/неполные|расшифровывается|Сохраните SMTP-пароль/i', $message)) {
            return 'Активные SMTP-настройки неполные или старый пароль невозможно прочитать. Сохраните SMTP-пароль заново и повторите восстановление.';
        }
        if (preg_match('/connection|timed? out|refused|could not connect|network|stream_socket|TLS|SSL/i', $message)) {
            return 'Не удалось подключиться к SMTP-серверу. Проверьте host, port и encryption (465/ssl или 587/tls).';
        }
        if (preg_match('/sender|from|relay|verified|not allowed/i', $message)) {
            return 'SMTP-сервер отклонил отправителя. MAIL_FROM_ADDRESS должен совпадать с авторизованным ящиком.';
        }
        return 'Не удалось отправить письмо восстановления: ' . $message;
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
