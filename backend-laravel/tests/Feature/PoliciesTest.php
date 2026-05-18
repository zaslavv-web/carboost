<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Department;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\WithDomainUsers;

/**
 * Smoke-проверки политик: суперадмин обходит, company_admin/hrd видят свою
 * компанию, employee — только своё, чужая компания → 403.
 */
class PoliciesTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_superadmin_can_create_anywhere(): void
    {
        $c = $this->makeCompany();
        $this->actingAs($this->makeUser('superadmin'), 'sanctum')
            ->postJson('/api/db/departments', ['values' => ['name' => 'X', 'company_id' => $c->id]])
            ->assertOk();
    }

    public function test_company_admin_cannot_edit_other_company_resource(): void
    {
        $c1 = $this->makeCompany();
        $c2 = $this->makeCompany();
        $d = Department::create(['company_id' => $c2->id, 'name' => 'Z']);

        $admin = $this->makeUser('company_admin', $c1->id);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/db/departments?eq.id={$d->id}", ['values' => ['name' => 'hax']])
            ->assertStatus(403);

        $this->assertSame('Z', $d->fresh()->name);
    }

    public function test_employee_cannot_delete_departments(): void
    {
        $c = $this->makeCompany();
        $d = Department::create(['company_id' => $c->id, 'name' => 'D']);
        $emp = $this->makeUser('employee', $c->id);

        $this->actingAs($emp, 'sanctum')
            ->deleteJson("/api/db/departments?eq.id={$d->id}")
            ->assertStatus(403);
    }
}
