<?php

namespace Tests;

use App\Models\Company;
use App\Models\Profile;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Helpers used across feature tests.
 *
 *   $user = $this->makeUser('employee');
 *   $this->actingAs($user, 'sanctum');
 */
trait WithDomainUsers
{
    protected function makeCompany(array $attrs = []): Company
    {
        return Company::create(array_merge([
            'id'   => (string) Str::uuid(),
            'name' => 'ACME ' . Str::random(4),
        ], $attrs));
    }

    protected function makeUser(string $role = 'employee', ?string $companyId = null, bool $verified = true): User
    {
        $companyId ??= $this->makeCompany()->id;
        $id = (string) Str::uuid();

        DB::table('auth.users')->insert([
            'id' => $id,
            'email' => Str::uuid() . '@test.local',
            'encrypted_password' => Hash::make('secret123'),
            'email_confirmed_at' => now(),
            'raw_user_meta_data' => json_encode([]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $user = User::findOrFail($id);

        Profile::create([
            'user_id'     => $id,
            'company_id'  => $companyId,
            'full_name'   => 'Test ' . Str::random(4),
            'is_verified' => $verified,
        ]);

        UserRole::create([
            'user_id' => $id,
            'role'    => $role,
        ]);

        return $user;
    }
}
