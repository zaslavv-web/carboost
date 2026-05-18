<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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
        string $requestedRole = 'employee',
        ?string $companyId = null,
        bool $isVerified = false,
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

        $user = User::findOrFail($id);
        $this->ensureDomainRows($user, [
            'name' => $fullName,
            'email' => strtolower($email),
            'avatar' => null,
        ], true, $requestedRole, $companyId, $isVerified);
        return $user;
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
            'name' => $googleUser['name'] ?? $email,
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

        // Если в таблице users нет колонки `name` (наша «новая» схема) — убираем её,
        // чтобы insert не падал. На «старой» Laravel-схеме колонка обязательная.
        if (!Schema::hasColumn('users', 'name')) {
            unset($userRow['name']);
        }

        // На некоторых прод-серверах таблица users осталась от Laravel с integer id.
        // В таком случае не передаём UUID вручную — пусть БД выдаст auto_increment id.
        if (!$this->tableIdIsInteger('users')) {
            $userRow['id'] = (string) Str::uuid();
        }

        $this->fillMissingDefaults('users', $userRow);

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

    /**
     * Для MySQL: пробегаемся по NOT NULL колонкам без DEFAULT и подставляем
     * безопасные значения, чтобы insert не падал на старых схемах,
     * где таблицы создавались без миграций нашего проекта.
     */
    private function fillMissingDefaults(string $table, array &$row): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        try {
            $columns = DB::select("SHOW COLUMNS FROM `{$table}`");
        } catch (\Throwable) {
            return;
        }

        foreach ($columns as $col) {
            $name = $col->Field;
            if (array_key_exists($name, $row)) {
                continue;
            }
            // Колонка nullable или имеет DEFAULT — пропускаем.
            if (strtoupper((string) $col->Null) === 'YES') {
                continue;
            }
            if ($col->Default !== null) {
                continue;
            }
            // auto_increment / generated — пропускаем.
            if (str_contains(strtolower((string) $col->Extra), 'auto_increment')
                || str_contains(strtolower((string) $col->Extra), 'generated')) {
                continue;
            }

            $type = strtolower((string) $col->Type);
            $row[$name] = match (true) {
                str_contains($type, 'int'), str_contains($type, 'decimal'),
                str_contains($type, 'float'), str_contains($type, 'double') => 0,
                str_contains($type, 'bool'), str_contains($type, 'tinyint(1)') => false,
                str_contains($type, 'json') => '{}',
                str_contains($type, 'date'), str_contains($type, 'time') => now(),
                default => '',
            };
        }
    }


    private function ensureDomainRows(User $user, array $googleUser, bool $isNewUser, string $role = 'employee', ?string $companyId = null, bool $isVerified = false): void
    {
        $profile = DB::table('profiles')->where('user_id', $user->id)->first();
        if ($profile) {
            $updates = [
                'full_name' => $profile->full_name ?: ($googleUser['name'] ?? $user->email),
                'avatar_url' => $googleUser['avatar'] ?? $profile->avatar_url,
                'requested_role' => $profile->requested_role ?: ($role ?: 'employee'),
                'is_verified' => $isVerified || (bool) $profile->is_verified,
                'updated_at' => now(),
            ];

            if ($this->canWriteColumnValue('profiles', 'company_id', $companyId)) {
                $updates['company_id'] = $companyId;
            }

            DB::table('profiles')->where('user_id', $user->id)->update($updates);
        } else {
            $profileRow = [
                'user_id' => $user->id,
                'full_name' => $googleUser['name'] ?? $user->email,
                'avatar_url' => $googleUser['avatar'] ?? null,
                'requested_role' => $role,
                'is_verified' => $isVerified,
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if ($this->canWriteColumnValue('profiles', 'company_id', $companyId)) {
                $profileRow['company_id'] = $companyId;
            }

            if (!$this->tableIdIsInteger('profiles')) {
                $profileRow['id'] = (string) Str::uuid();
            }

            $this->fillMissingDefaults('profiles', $profileRow);

            DB::table('profiles')->insert($profileRow);
        }


        if ($isNewUser || !DB::table('user_roles')->where('user_id', $user->id)->exists()) {
            $roleValues = [];
            if (!$this->tableIdIsInteger('user_roles')) {
                $roleValues['id'] = DB::table('user_roles')->where('user_id', $user->id)->where('role', $role)->value('id') ?: (string) Str::uuid();
            }

            DB::table('user_roles')->updateOrInsert(
                ['user_id' => $user->id, 'role' => $role],
                $roleValues
            );
        }
    }
}
