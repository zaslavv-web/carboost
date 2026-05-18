<?php

namespace Tests\Feature;

use App\Models\Department;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\WithDomainUsers;

class DbControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/db/departments?select=*')->assertStatus(401);
    }

    public function test_rejects_unknown_table_with_404(): void
    {
        $this->actingAs($this->makeUser('superadmin'), 'sanctum')
            ->getJson('/api/db/secret_unknown_table?select=*')
            ->assertStatus(404)
            ->assertJsonPath('error', "Таблица 'secret_unknown_table' недоступна");
    }

    public function test_superadmin_lists_departments_across_companies(): void
    {
        $c1 = $this->makeCompany();
        $c2 = $this->makeCompany();
        Department::create(['company_id' => $c1->id, 'name' => 'Sales']);
        Department::create(['company_id' => $c2->id, 'name' => 'Eng']);

        $this->actingAs($this->makeUser('superadmin'), 'sanctum')
            ->getJson('/api/db/departments?select=*&order=name.asc')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_company_admin_sees_only_own_company_departments(): void
    {
        $c1 = $this->makeCompany();
        $c2 = $this->makeCompany();
        Department::create(['company_id' => $c1->id, 'name' => 'A']);
        Department::create(['company_id' => $c2->id, 'name' => 'B']);

        $admin = $this->makeUser('company_admin', $c1->id);
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/db/departments?select=*')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'A');
    }

    public function test_employee_cannot_create_department(): void
    {
        $emp = $this->makeUser('employee');
        $this->actingAs($emp, 'sanctum')
            ->postJson('/api/db/departments', ['values' => ['name' => 'X']])
            ->assertStatus(403)
            ->assertJsonPath('error', 'Недостаточно прав');
    }

    public function test_filters_eq_in_is_apply(): void
    {
        $c = $this->makeCompany();
        Department::create(['company_id' => $c->id, 'name' => 'Alpha']);
        Department::create(['company_id' => $c->id, 'name' => 'Beta']);

        $admin = $this->makeUser('company_admin', $c->id);
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/db/departments?select=*&eq.name=Alpha')
            ->assertOk()->assertJsonCount(1, 'data');

        $this->getJson('/api/db/departments?select=*&in.name=Alpha,Beta')
            ->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_single_returns_404_when_not_found(): void
    {
        $this->actingAs($this->makeUser('superadmin'), 'sanctum')
            ->getJson('/api/db/departments?select=*&eq.name=___missing___&single=1')
            ->assertStatus(404);
    }
}
