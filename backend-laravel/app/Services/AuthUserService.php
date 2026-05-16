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

        $existingId = DB::table('auth.users')->where('email', $email)->value('id');
        if ($existingId) {
            // Линкуем google_id в meta, не трогаем пароль
            DB::statement(
                "UPDATE auth.users
                 SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                     || jsonb_build_object('google_id', ?::text, 'avatar_url', ?::text),
                     email_confirmed_at = COALESCE(email_confirmed_at, now()),
                     updated_at = now()
                 WHERE id = ?",
                [$googleUser['id'], $googleUser['avatar'] ?? null, $existingId]
            );
            return User::findOrFail($existingId);
        }

        $id = (string) Str::uuid();
        DB::statement(
            "INSERT INTO auth.users
                (id, email, encrypted_password, email_confirmed_at,
                 raw_user_meta_data, created_at, updated_at,
                 aud, role, instance_id)
             VALUES (?, ?, NULL, now(), ?::jsonb, now(), now(),
                     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')",
            [
                $id,
                $email,
                json_encode([
                    'full_name'      => $googleUser['name']   ?? $email,
                    'avatar_url'     => $googleUser['avatar'] ?? null,
                    'google_id'      => $googleUser['id'],
                    'requested_role' => 'employee',
                    'provider'       => 'google',
                ]),
            ]
        );

        return User::findOrFail($id);
    }
}
