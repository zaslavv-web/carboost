<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Создаёт/обновляет системного пользователя «Техподдержка».
 * Этот аккаунт един на всю платформу (без company_id), помечен is_support=true
 * и виден в контактах всех компаний.
 */
class SupportUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = 'support@career-track.app';

        $user = DB::table('users')->where('email', $email)->first();
        if (!$user) {
            $id = (string) Str::uuid();
            DB::table('users')->insert([
                'id'                => $id,
                'email'             => $email,
                'password'          => Hash::make(Str::random(40)),
                'email_verified_at' => now(),
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);
            $userId = $id;
        } else {
            $userId = (string) $user->id;
        }

        DB::table('profiles')->updateOrInsert(
            ['user_id' => $userId],
            [
                'full_name'   => 'Техподдержка',
                'is_verified' => true,
                'is_support'  => true,
                'company_id'  => null,
                'updated_at'  => now(),
                'created_at'  => now(),
            ],
        );

        DB::table('user_roles')->updateOrInsert(
            ['user_id' => $userId, 'role' => 'superadmin'],
            ['updated_at' => now(), 'created_at' => now()],
        );
    }
}
