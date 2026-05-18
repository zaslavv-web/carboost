<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\WithDomainUsers;

class ImpersonationTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_non_superadmin_cannot_impersonate(): void
    {
        $admin  = $this->makeUser('company_admin');
        $target = $this->makeUser('employee');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/impersonation/start', ['target_user_id' => $target->id])
            ->assertStatus(403);
    }

    public function test_superadmin_can_impersonate_and_get_token(): void
    {
        $super  = $this->makeUser('superadmin');
        $target = $this->makeUser('employee');

        $res = $this->actingAs($super, 'sanctum')
            ->postJson('/api/impersonation/start', ['target_user_id' => $target->id]);
        $res->assertStatus(201)->assertJsonStructure(['token']);
    }

    public function test_impersonation_stop_revokes_tokens(): void
    {
        $super = $this->makeUser('superadmin');
        $this->actingAs($super, 'sanctum')
            ->postJson('/api/impersonation/stop')
            ->assertStatus(204);
    }
}
