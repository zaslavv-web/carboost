<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/** SecurityController: кастомные RBAC-роли, аудит, доступ только для admin/HRD. */
class SecurityControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    private function makeRole(string $companyId, string $title = 'Ревьюер'): string
    {
        $id = (string) Str::uuid();
        DB::table('custom_roles')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'code' => 'reviewer',
            'title' => $title,
            'base_role' => 'employee',
            'permissions' => json_encode(['performance.read']),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return $id;
    }

    public function test_employee_forbidden_on_stats_and_roles(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);

        $this->actingAs($employee, 'sanctum')->getJson('/api/security/stats')->assertStatus(403);
        $this->actingAs($employee, 'sanctum')->getJson('/api/security/roles')->assertStatus(403);
    }

    public function test_hrd_and_admin_can_list_roles(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $admin = $this->makeUser('company_admin', $company->id);
        $this->makeRole($company->id);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/security/roles')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/security/roles')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_hrd_can_create_role(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);

        $response = $this->actingAs($hrd, 'sanctum')->postJson('/api/security/roles', [
            'title' => 'Кастомная роль',
            'permissions' => ['employees.read'],
        ])->assertOk();

        $this->assertDatabaseHas('custom_roles', [
            'id' => $response->json('id'),
            'company_id' => $company->id,
            'title' => 'Кастомная роль',
        ]);
    }

    public function test_assign_and_unassign_role_members(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $member = $this->makeUser('employee', $company->id);
        $roleId = $this->makeRole($company->id);

        $this->actingAs($hrd, 'sanctum')
            ->postJson("/api/security/roles/{$roleId}/members", ['user_ids' => [$member->id]])
            ->assertOk()
            ->assertJsonPath('added', 1);

        $this->assertDatabaseHas('custom_role_user', ['custom_role_id' => $roleId, 'user_id' => $member->id]);

        $this->actingAs($hrd, 'sanctum')
            ->getJson("/api/security/roles/{$roleId}/members")
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->actingAs($hrd, 'sanctum')
            ->deleteJson("/api/security/roles/{$roleId}/members/{$member->id}")
            ->assertOk();

        $this->assertDatabaseMissing('custom_role_user', ['custom_role_id' => $roleId, 'user_id' => $member->id]);
    }

    public function test_role_from_foreign_company_is_not_accessible(): void
    {
        $company = $this->makeCompany();
        $other = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $roleId = $this->makeRole($other->id);

        $this->actingAs($hrd, 'sanctum')
            ->patchJson("/api/security/roles/{$roleId}", ['title' => 'Hack'])
            ->assertStatus(403);

        $this->actingAs($hrd, 'sanctum')
            ->deleteJson("/api/security/roles/{$roleId}")
            ->assertStatus(403);
    }

    public function test_stats_returns_company_scoped_counters(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $this->makeRole($company->id);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/security/stats')
            ->assertOk()
            ->assertJsonPath('roles', 1)
            ->assertJsonStructure(['providers', 'scim_tokens', 'events_30d', 'users_total', 'permissions']);
    }

    public function test_sso_scim_modules_are_covered_but_require_manual_saml_verification(): void
    {
        // SAML-подпись/сертификаты и реальный SCIM-обмен не проверяются юнит-тестами:
        // здесь фигурируют только CRUD-эндпоинты через sso_providers/scim_tokens (таблицы есть в миграциях).
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);

        $response = $this->actingAs($hrd, 'sanctum')->postJson('/api/security/providers', [
            'kind' => 'oidc',
            'title' => 'Corp SSO',
        ])->assertOk();

        $this->assertDatabaseHas('sso_providers', ['id' => $response->json('id'), 'company_id' => $company->id]);

        $token = $this->actingAs($hrd, 'sanctum')->postJson('/api/security/scim-tokens', [
            'name' => 'HRIS sync',
        ])->assertOk();

        $this->assertNotEmpty($token->json('token'));
        $this->assertDatabaseHas('scim_tokens', ['id' => $token->json('id'), 'company_id' => $company->id]);
    }
}
