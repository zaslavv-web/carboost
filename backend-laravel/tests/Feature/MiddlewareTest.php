<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\WithDomainUsers;

class MiddlewareTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_unverified_user_blocked_with_pending_code(): void
    {
        $user = $this->makeUser('employee', null, verified: false);
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications')
            ->assertStatus(403)
            ->assertJsonPath('code', 'pending_verification');
    }

    public function test_user_without_company_gets_missing_company_code(): void
    {
        $user = $this->makeUser('employee');
        // strip company
        \App\Models\Profile::where('user_id', $user->id)->update(['company_id' => null]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/notifications')
            ->assertStatus(403)
            ->assertJsonPath('code', 'missing_company');
    }

    public function test_profiles_me_allowed_without_company(): void
    {
        $user = $this->makeUser('employee');
        \App\Models\Profile::where('user_id', $user->id)->update(['company_id' => null]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/profiles/me')
            ->assertOk();
    }
}
