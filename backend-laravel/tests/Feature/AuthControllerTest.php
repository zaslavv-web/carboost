<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_register_creates_user_and_returns_token(): void
    {
        $res = $this->postJson('/api/auth/register', [
            'email'     => 'new@user.io',
            'password'  => 'secret123',
            'full_name' => 'New User',
            'requested_role' => 'employee',
        ]);
        $res->assertCreated()->assertJsonStructure(['token', 'user' => ['id', 'email', 'role']]);
        $this->assertSame('new@user.io', $res->json('user.email'));
        $this->assertNotEmpty($res->json('token'));
    }

    public function test_register_rejects_duplicate_email(): void
    {
        DB::table('auth.users')->insert([
            'id' => (string) Str::uuid(),
            'email' => 'dup@u.io',
            'encrypted_password' => Hash::make('x'),
            'email_confirmed_at' => now(),
            'raw_user_meta_data' => json_encode([]),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->postJson('/api/auth/register', [
            'email' => 'dup@u.io', 'password' => 'secret123', 'full_name' => 'Dup',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_login_succeeds_with_correct_password(): void
    {
        $user = $this->makeUser('employee');
        $res = $this->postJson('/api/auth/login', [
            'email' => $user->email, 'password' => 'secret123',
        ]);
        $res->assertOk();
        $this->assertNotEmpty($res->json('token'));
    }

    public function test_login_rejects_wrong_password(): void
    {
        $user = $this->makeUser('employee');
        $this->postJson('/api/auth/login', [
            'email' => $user->email, 'password' => 'wrong',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_me_returns_user_for_authenticated_request(): void
    {
        $user = $this->makeUser('employee');
        $this->actingAs($user, 'sanctum');
        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('email', $user->email)
            ->assertJsonPath('role', 'employee');
    }

    public function test_me_returns_401_without_token(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_logout_revokes_current_token(): void
    {
        $user = $this->makeUser('employee');
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/auth/logout')->assertOk();
    }
}
