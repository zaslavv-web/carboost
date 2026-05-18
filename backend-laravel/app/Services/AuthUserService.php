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
            $this->ensureDomainRows($existing, $googleUser, false);
            return $existing->refresh();
        }

        $userRow = [
            'email' => $email,
            'password' => Hash::make(Str::random(64)),
            'email_verified_at' => now(),
            'meta' => json_encode([
                'full_name'      => $googleUser['name']   ?? $email,
                'avatar_url'     => $googleUser['avatar'] ?? null,
                'google_id'      => $googleUser['id'],
                'requested_role' => 'employee',
                'provider'       => 'google',
            ], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ];

        // На некоторых прод-серверах таблица users осталась от Laravel с integer id.
        // В таком случае не передаём UUID вручную — пусть БД выдаст auto_increment id.
        if (!$this->tableIdIsInteger('users')) {
            $userRow['id'] = (string) Str::uuid();
        }

        DB::table('users')->insert($userRow);

        $user = User::where('email', $email)->firstOrFail();

        $this->ensureDomainRows($user, $googleUser, true);
        return $user->refresh();
    }

    private function tableIdIsInteger(string $table): bool
    {
        if (DB::getDriverName() !== 'mysql') {
            return false;
        }

        try {
            $column = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE 'id'");
            return $column && str_contains(strtolower((string) $column->Type), 'int');
        } catch (\Throwable) {
            return false;
        }
    }

    private function ensureDomainRows(User $user, array $googleUser, bool $isNewUser): void
    {
        $profile = DB::table('profiles')->where('user_id', $user->id)->first();
        if ($profile) {
            DB::table('profiles')->where('user_id', $user->id)->update([
                'full_name' => $profile->full_name ?: ($googleUser['name'] ?? $user->email),
                'avatar_url' => $googleUser['avatar'] ?? $profile->avatar_url,
                'updated_at' => now(),
            ]);
        } else {
            $profileRow = [
                'user_id' => $user->id,
                'full_name' => $googleUser['name'] ?? $user->email,
                'avatar_url' => $googleUser['avatar'] ?? null,
                'requested_role' => 'employee',
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (!$this->tableIdIsInteger('profiles')) {
                $profileRow['id'] = (string) Str::uuid();
            }

            DB::table('profiles')->insert($profileRow);
        }

        if ($isNewUser || !DB::table('user_roles')->where('user_id', $user->id)->exists()) {
            $roleValues = [];
            if (!$this->tableIdIsInteger('user_roles')) {
                $roleValues['id'] = DB::table('user_roles')->where('user_id', $user->id)->where('role', 'employee')->value('id') ?: (string) Str::uuid();
            }

            DB::table('user_roles')->updateOrInsert(
                ['user_id' => $user->id, 'role' => 'employee'],
                $roleValues
            );
        }
    }
}
