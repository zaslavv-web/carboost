<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuthUserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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

        // Email-уникальность — на уровне auth.users
        $exists = \DB::table('auth.users')->where('email', strtolower($data['email']))->exists();
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

        if (!$user || !$user->password || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => 'Неверный email или пароль',
            ]);
        }

        $token = $user->createToken('spa')->plainTextToken;

        return response()->json([
            'user'  => $this->presentUser($user),
            'token' => $token,
        ]);
    }

    /** POST /api/auth/logout (auth:sanctum) */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['ok' => true]);
    }

    /** GET /api/auth/me (auth:sanctum) */
    public function me(Request $request): JsonResponse
    {
        return response()->json($this->presentUser($request->user()));
    }

    private function presentUser(User $user): array
    {
        $profile = \DB::table('profiles')->where('user_id', $user->id)->first();
        return [
            'id'              => $user->id,
            'email'           => $user->email,
            'email_verified'  => (bool) $user->email_verified_at,
            'full_name'       => $profile->full_name        ?? null,
            'avatar_url'      => $profile->avatar_url       ?? ($user->meta['avatar_url'] ?? null),
            'company_id'      => $profile->company_id       ?? null,
            'is_verified'     => (bool) ($profile->is_verified ?? false),
            'requested_role'  => $profile->requested_role   ?? null,
            'role'            => $user->domainRole(),
            'roles'           => \DB::table('user_roles')
                ->where('user_id', $user->id)
                ->pluck('role')
                ->values()
                ->all(),
            'meta'            => $user->meta,
        ];
    }
}
