<?php

namespace Tests\Feature;

use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Tests\WithDomainUsers;

/** TwoFactorController: включение TOTP, backup-коды, disable, challenge при логине. */
class TwoFactorControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_setup_returns_secret_and_otpauth_url(): void
    {
        $user = $this->makeUser('employee');

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/auth/2fa/setup')
            ->assertOk()
            ->assertJsonStructure(['secret', 'otpauth_url']);

        $this->assertDatabaseHas('user_two_factor', [
            'user_id' => $user->id,
            'enabled' => false,
        ]);
        $this->assertStringStartsWith('otpauth://totp/', $response->json('otpauth_url'));
    }

    public function test_confirm_with_valid_code_enables_2fa_and_issues_backup_codes(): void
    {
        $user = $this->makeUser('employee');
        $secret = $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/setup')->json('secret');

        $code = Totp::code($secret);
        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/auth/2fa/confirm', ['code' => $code])
            ->assertOk()
            ->assertJsonStructure(['ok', 'backup_codes']);

        $this->assertCount(10, $response->json('backup_codes'));
        $this->assertDatabaseHas('user_two_factor', ['user_id' => $user->id, 'enabled' => true]);
    }

    public function test_confirm_with_invalid_code_fails(): void
    {
        $user = $this->makeUser('employee');
        $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/setup');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/auth/2fa/confirm', ['code' => '000000'])
            ->assertStatus(422);
    }

    public function test_login_requires_2fa_challenge_and_valid_code_returns_token(): void
    {
        $user = $this->makeUser('employee');
        $user->password = bcrypt('secret123');
        $user->save();

        $secret = $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/setup')->json('secret');
        $code = Totp::code($secret);
        $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/confirm', ['code' => $code])->assertOk();

        // логин без 2FA-кода: получаем challenge вместо токена
        $login = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'secret123',
        ])->assertOk();

        $this->assertTrue((bool) $login->json('2fa_required'));
        $challengeToken = $login->json('challenge_token');
        $this->assertNotEmpty($challengeToken);

        // неверный код на challenge
        $this->postJson('/api/auth/2fa/challenge', [
            'challenge_token' => $challengeToken,
            'code' => '000000',
        ])->assertStatus(422);

        // верный код меняет challenge на sanctum-токен
        $ok = $this->postJson('/api/auth/2fa/challenge', [
            'challenge_token' => $challengeToken,
            'code' => Totp::code($secret),
        ])->assertOk()
            ->assertJsonStructure(['user', 'token']);

        $this->assertNotEmpty($ok->json('token'));
    }

    public function test_backup_code_is_single_use(): void
    {
        $user = $this->makeUser('employee');
        $secret = $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/setup')->json('secret');
        $code = Totp::code($secret);
        $confirm = $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/confirm', ['code' => $code]);
        $backupCode = $confirm->json('backup_codes')[0];

        $challengeToken = \App\Http\Controllers\Api\TwoFactorController::issueChallenge($user);
        $first = $this->postJson('/api/auth/2fa/challenge', [
            'challenge_token' => $challengeToken,
            'code' => $backupCode,
        ])->assertOk();
        $this->assertNotEmpty($first->json('token'));

        // повторное использование того же backup-кода не проходит
        $challengeToken2 = \App\Http\Controllers\Api\TwoFactorController::issueChallenge($user);
        $this->postJson('/api/auth/2fa/challenge', [
            'challenge_token' => $challengeToken2,
            'code' => $backupCode,
        ])->assertStatus(422);
    }

    public function test_disable_requires_valid_code_and_removes_row(): void
    {
        $user = $this->makeUser('employee');
        $secret = $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/setup')->json('secret');
        $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/confirm', ['code' => Totp::code($secret)]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/auth/2fa/disable', ['code' => '000000'])
            ->assertStatus(422);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/auth/2fa/disable', ['code' => Totp::code($secret)])
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertDatabaseMissing('user_two_factor', ['user_id' => $user->id]);
    }

    public function test_status_reflects_enabled_state(): void
    {
        $user = $this->makeUser('employee');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/auth/2fa/status')
            ->assertOk()
            ->assertJsonPath('enabled', false);

        $secret = $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/setup')->json('secret');
        $this->actingAs($user, 'sanctum')->postJson('/api/auth/2fa/confirm', ['code' => Totp::code($secret)]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/auth/2fa/status')
            ->assertOk()
            ->assertJsonPath('enabled', true);
    }
}
