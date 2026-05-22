<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\AuthUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Phase 13: создание пользователя суперадмином/HRD.
 * Заменяет Supabase Edge Function `admin-create-user`.
 *
 * Только пользователь с ролью superadmin или company_admin может вызвать.
 * Для company_admin — company_id игнорируется и берётся из профиля.
 */
class UsersController extends Controller
{
    public function __construct(private AuthUserService $users) {}

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        $isSuperadmin = $actor && method_exists($actor, 'domainRole') && $actor->domainRole() === 'superadmin';
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

        // Уникальность email
        $exists = \DB::table('auth.users')->where('email', $email)->exists();
        if ($exists) {
            throw ValidationException::withMessages([
                'email' => 'Пользователь с таким email уже существует',
            ]);
        }

        // Company admin может создавать только в своей компании
        $companyId = $isSuperadmin
            ? ($data['company_id'] ?? null)
            : \DB::table('profiles')->where('user_id', $actor->id)->value('company_id');

        if (!$isSuperadmin && !$companyId) {
            return response()->json(['error' => 'У администратора нет компании'], 422);
        }

        // Сразу подтверждённый, со случайным паролем — пользователь сбросит через email
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
                    \Log::warning('admin user invite runtime retry failed', ['email' => $email, 'err' => $retryException->getMessage()]);
                }
            }
            // не фатально — администратор может скинуть ссылку вручную
            \Log::warning('admin user invite email failed', ['email' => $email, 'err' => $e->getMessage()]);
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
}
