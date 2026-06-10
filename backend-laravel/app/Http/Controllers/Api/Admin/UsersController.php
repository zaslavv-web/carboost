<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuthUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Создание пользователя суперадмином/HRD.
 * Заменяет legacy Edge Function `admin-create-user`.
 *
 * Только пользователь с ролью superadmin или company_admin может вызвать.
 * Для company_admin — company_id игнорируется и берётся из профиля.
 */
class UsersController extends Controller
{
    public function __construct(private AuthUserService $users) {}

    public function store(Request $request): JsonResponse
    {
        $actor          = $request->user();
        $isSuperadmin   = $actor && method_exists($actor, 'domainRole') && $actor->domainRole() === 'superadmin';
        $isCompanyAdmin = $actor && method_exists($actor, 'domainRole') && $actor->domainRole() === 'company_admin';

        if (!$isSuperadmin && !$isCompanyAdmin) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $data = $request->validate([
            'full_name'  => ['required', 'string', 'min:2', 'max:255'],
            'email'      => ['required', 'email', 'max:255'],
            'role'       => ['required', 'in:employee,manager,hrd,company_admin'],
            'company_id' => ['nullable', 'uuid'],
        ]);

        $email = strtolower(trim($data['email']));

        // Проверка уникальности email в таблице users (не auth.users!)
        $exists = DB::table('users')->where('email', $email)->exists();
        if ($exists) {
            throw ValidationException::withMessages([
                'email' => 'Пользователь с таким email уже существует',
            ]);
        }

        // Company admin может создавать только в своей компании
        $actorDomainId = method_exists($actor, 'domainUserId') ? $actor->domainUserId() : $actor->id;
        $companyId = $isSuperadmin
            ? ($data['company_id'] ?? null)
            : DB::table('profiles')->where('user_id', $actorDomainId)->value('company_id');

        if (!$isSuperadmin && !$companyId) {
            return response()->json(['error' => 'У администратора нет компании'], 422);
        }

        // Создаём со случайным паролем — пользователь сбросит через email
        $tempPassword = Str::random(24);

        $user = $this->users->createWithPassword(
            $email,
            $tempPassword,
            $data['full_name'],
            $data['role'],
            companyId: $companyId,
            isVerified: true,
        );

        // Шлём письмо для установки пароля (через стандартный broker)
        $mail = app(\App\Services\EmailConfigService::class);
        try {
            $mail->apply();
            \Illuminate\Support\Facades\Password::sendResetLink(['email' => $email]);
        } catch (\Throwable $e) {
            if (\App\Services\EmailConfigService::isSmtpAuthFailure($e)) {
                try {
                    $mail->applyRuntimeEnv();
                    \Illuminate\Support\Facades\Password::sendResetLink(['email' => $email]);
                    return response()->json([
                        'user' => [
                            'id'         => $user->id,
                            'email'      => $user->email,
                            'full_name'  => $data['full_name'],
                            'role'       => $data['role'],
                            'company_id' => $companyId,
                        ],
                    ], 201);
                } catch (\Throwable $retryException) {
                    Log::warning('admin user invite runtime retry failed', [
                        'email' => $email,
                        'err'   => $retryException->getMessage(),
                    ]);
                }
            }
            // Не фатально — администратор может скинуть ссылку вручную
            Log::warning('admin user invite email failed', [
                'email' => $email,
                'err'   => $e->getMessage(),
            ]);
        }

        return response()->json([
            'user' => [
                'id'         => $user->id,
                'email'      => $user->email,
                'full_name'  => $data['full_name'],
                'role'       => $data['role'],
                'company_id' => $companyId,
            ],
        ], 201);
    }

    /**
     * Повторно отправляет письмо восстановления пароля пользователю.
     * Superadmin — любому, company_admin — только своим.
     */
    public function sendPasswordReset(Request $request, string $userId): JsonResponse
    {
        $actor = $request->user();
        $isSuperadmin = $actor && method_exists($actor, 'domainRole') && $actor->domainRole() === 'superadmin';
        $isCompanyAdmin = $actor && method_exists($actor, 'domainRole') && $actor->domainRole() === 'company_admin';

        if (!$isSuperadmin && !$isCompanyAdmin) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $target = \DB::table('users')->where('id', $userId)->first();
        if (!$target) {
            return response()->json(['error' => 'Пользователь не найден'], 404);
        }

        if (!$isSuperadmin) {
            $actorCompany = \DB::table('profiles')->where('user_id', $actor->id)->value('company_id');
            $targetCompany = \DB::table('profiles')->where('user_id', $userId)->value('company_id');
            if (!$actorCompany || $actorCompany !== $targetCompany) {
                return response()->json(['error' => 'Пользователь не из вашей компании'], 403);
            }
        }

        $email = strtolower((string) $target->email);
        $mail = app(\App\Services\EmailConfigService::class);

        try {
            $mail->autoRepairActiveSettings();
            $mail->apply();
            $mail->preflight();
            \Illuminate\Support\Facades\Password::sendResetLink(['email' => $email]);
        } catch (\Throwable $e) {
            if (\App\Services\EmailConfigService::shouldFallbackToRuntimeEnv($e)) {
                try {
                    $mail->applyRuntimeEnv();
                    $mail->preflight();
                    \Illuminate\Support\Facades\Password::sendResetLink(['email' => $email]);
                } catch (\Throwable $retry) {
                    \Log::error('admin password reset retry failed', ['email' => $email, 'err' => $retry->getMessage()]);
                    return response()->json(['error' => 'Не удалось отправить письмо: ' . $retry->getMessage()], 422);
                }
            } else {
                \Log::error('admin password reset failed', ['email' => $email, 'err' => $e->getMessage()]);
                return response()->json(['error' => 'Не удалось отправить письмо: ' . $e->getMessage()], 422);
            }
        }

        return response()->json(['ok' => true, 'email' => $email]);
    }

    /**
     * Назначить/изменить компанию пользователя. Доступно только суперадмину.
     * Используется, когда пользователь застрял без company_id и не может пройти онбординг.
     */
    public function assignCompany(Request $request, string $userId): JsonResponse
    {
        $actor = $request->user();
        $isSuperadmin = $actor && method_exists($actor, 'domainRole') && $actor->domainRole() === 'superadmin';
        if (!$isSuperadmin) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $data = $request->validate([
            'company_id' => ['nullable', 'uuid'],
        ]);
        $companyId = $data['company_id'] ?? null;

        if ($companyId && !DB::table('companies')->where('id', $companyId)->exists()) {
            return response()->json(['error' => 'Компания не найдена'], 404);
        }

        $profile = DB::table('profiles')->where('user_id', $userId)->first();
        if (!$profile) {
            return response()->json(['error' => 'Профиль не найден'], 404);
        }

        DB::table('profiles')->where('user_id', $userId)->update([
            'company_id' => $companyId,
            'updated_at' => now(),
        ]);

        return response()->json([
            'ok'         => true,
            'user_id'    => $userId,
            'company_id' => $companyId,
        ]);
    }
}
