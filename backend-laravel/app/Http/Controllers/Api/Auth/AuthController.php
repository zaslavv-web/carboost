<?php

namespace App\Services;

use App\Models\User;
use App\Models\Profile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthUserService
{
    public function createWithPassword(
        string $email,
        string $password,
        string $fullName,
        string $requestedRole = 'employee'
    ): User {
        $id = (string) Str::uuid();

        DB::table('users')->insert([
            'id'                => $id,
            'email'             => strtolower($email),
            'password'          => Hash::make($password),
            'email_verified_at' => null,
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        DB::table('profiles')->insert([
            'id'             => (string) Str::uuid(),
            'user_id'        => $id,
            'full_name'      => $fullName,
            'requested_role' => $requestedRole,
            'is_verified'    => false,
            'overall_score'  => 0,
            'role_readiness' => 0,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        DB::table('user_roles')->insert([
            'id'         => (string) Str::uuid(),
            'user_id'    => $id,
            'role'       => $requestedRole,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::findOrFail($id);
    }

    public function findOrCreateFromGoogle(array $googleUser): User
    {
        $email = strtolower($googleUser['email']);

        $existing = DB::table('users')->where('email', $email)->first();
        if ($existing) {
            DB::table('users')->where('id', $existing->id)->update([
                'updated_at' => now(),
            ]);
            return User::findOrFail($existing->id);
        }

        $id = (string) Str::uuid();

        DB::table('users')->insert([
            'id'                => $id,
            'email'             => $email,
            'password'          => null,
            'email_verified_at' => now(),
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        DB::table('profiles')->insert([
            'id'             => (string) Str::uuid(),
            'user_id'        => $id,
            'full_name'      => $googleUser['name']   ?? $email,
            'avatar_url'     => $googleUser['avatar'] ?? null,
            'requested_role' => 'employee',
            'is_verified'    => false,
            'overall_score'  => 0,
            'role_readiness' => 0,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);

        DB::table('user_roles')->insert([
            'id'         => (string) Str::uuid(),
            'user_id'    => $id,
            'role'       => 'employee',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::findOrFail($id);
    }
}
