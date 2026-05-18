<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Создаёт/обновляет пользователей напрямую в auth.users (Supabase-схема).
 *
 * Eloquent через VIEW public.users поддерживает только UPDATE — INSERT/DELETE
 * требуют прямого SQL. Этот сервис — единственное место в коде, где мы
 * пишем в auth.users.
 *
 * Триггер handle_new_user (из дампа Supabase) автоматически создаёт строку
 * в public.profiles + public.user_roles при INSERT в auth.users — мы на это
 * полагаемся.
 */
class AuthUserService
{
    /**
     * Создаёт нового пользователя с email + bcrypt-паролем.
     * Возвращает Eloquent-модель User (через VIEW).
     */
    public function createWithPassword(
        string $email,
        string $password,
        string $fullName,
        string $requestedRole = 'employee'
    ): User {
        $id = (string) Str::uuid();
        $hash = Hash::make($password); // bcrypt — совместим с Supabase

        DB::statement(
            "INSERT INTO auth.users
                (id, email, encrypted_password, email_confirmed_at,
                 raw_user_meta_data, created_at, updated_at,
                 aud, role, instance_id)
             VALUES (?, ?, ?, NULL, ?::jsonb, now(), now(),
                     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')",
            [
                $id,
                strtolower($email),
                $hash,
                json_encode([
                    'full_name'      => $fullName,
                    'requested_role' => $requestedRole,
                ]),
            ]
        );

        // Триггер handle_new_user уже создал profile + user_role.
        return User::findOrFail($id);
    }

    /**
     * Создаёт пользователя через Google SSO (без пароля).
     * Если пользователь с таким email уже есть — линкует google_id и возвращает его.
     */
    public function findOrCreateFromGoogle(array $googleUser): User
    {
        $email = strtolower($googleUser['email']);

        $existing = User::where('email', $email)->first();
        if ($existing) {
            $meta = array_merge($existing->meta ?? [], [
                'google_id' => $googleUser['id'],
                'avatar_url' => $googleUser['avatar'] ?? null,
                'provider' => 'google',
            ]);
            $existing->forceFill([
                'email_verified_at' => $existing->email_verified_at ?? now(),
                'meta' => $meta,
            ])->save();
            $this->ensureDomainRows($existing, $googleUser);
            return $existing->refresh();
        }

        $id = (string) Str::uuid();
        $user = User::forceCreate([
            'id' => $id,
            'email' => $email,
            'password' => null,
            'email_verified_at' => now(),
            'meta' => [
                'full_name'      => $googleUser['name']   ?? $email,
                'avatar_url'     => $googleUser['avatar'] ?? null,
                'google_id'      => $googleUser['id'],
                'requested_role' => 'employee',
                'provider'       => 'google',
            ],
        ]);

        $this->ensureDomainRows($user, $googleUser);
        return $user->refresh();
    }

    private function ensureDomainRows(User $user, array $googleUser): void
    {
        DB::table('profiles')->updateOrInsert(
            ['user_id' => $user->id],
            [
                'id' => DB::table('profiles')->where('user_id', $user->id)->value('id') ?: (string) Str::uuid(),
                'full_name' => $googleUser['name'] ?? $user->email,
                'avatar_url' => $googleUser['avatar'] ?? null,
                'requested_role' => 'employee',
                'updated_at' => now(),
                'created_at' => DB::table('profiles')->where('user_id', $user->id)->value('created_at') ?: now(),
            ]
        );

        DB::table('user_roles')->updateOrInsert(
            ['user_id' => $user->id, 'role' => 'employee'],
            ['id' => DB::table('user_roles')->where('user_id', $user->id)->where('role', 'employee')->value('id') ?: (string) Str::uuid()]
        );
    }
}
