<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/** PredictiveController: прогноз увольнений, драйверы, бенчмарки, "что если", сценарии. */
class PredictiveControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    private function seedPrediction(string $companyId, string $userId, float $probability = 0.42, string $band = 'medium'): void
    {
        DB::table('attrition_predictions')->insert([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'user_id' => $userId,
            'horizon_days' => 180,
            'probability' => $probability,
            'band' => $band,
            'base_rate' => 0.2,
            'features' => json_encode(['tenure_months' => 12]),
            'drivers' => json_encode([
                ['feature' => 'tenure', 'label' => 'Стаж', 'action' => 'retain', 'shap' => 0.12],
            ]),
            'model_version' => 'v1',
            'computed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_employee_forbidden_on_overview(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);

        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/predictive/overview')
            ->assertStatus(403);
    }

    public function test_hrd_sees_overview_scoped_to_own_company(): void
    {
        $company = $this->makeCompany();
        $other = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $emp = $this->makeUser('employee', $company->id);
        $foreignEmp = $this->makeUser('employee', $other->id);

        $this->seedPrediction($company->id, $emp->id, 0.6, 'high');
        $this->seedPrediction($other->id, $foreignEmp->id, 0.9, 'high');

        $response = $this->actingAs($hrd, 'sanctum')->getJson('/api/predictive/overview')->assertOk();
        $response->assertJsonPath('scored', 1)
            ->assertJsonPath('bands.high', 1)
            ->assertJsonPath('bands.medium', 0);
    }

    public function test_hr_can_list_employees_with_filters(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);
        $emp = $this->makeUser('employee', $company->id);
        $this->seedPrediction($company->id, $emp->id, 0.55, 'high');

        $this->actingAs($hr, 'sanctum')
            ->getJson('/api/predictive/employees?band=high')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $emp->id);

        $this->actingAs($hr, 'sanctum')
            ->getJson('/api/predictive/employees?band=low')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_employee_detail_scoped_by_company(): void
    {
        $company = $this->makeCompany();
        $other = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $emp = $this->makeUser('employee', $company->id);
        $foreignHrd = $this->makeUser('hrd', $other->id);
        $this->seedPrediction($company->id, $emp->id);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/predictive/employees/' . $emp->id)
            ->assertOk()
            ->assertJsonPath('user_id', $emp->id);

        // из чужой компании запись не видна -> not_found
        $this->actingAs($foreignHrd, 'sanctum')
            ->getJson('/api/predictive/employees/' . $emp->id)
            ->assertStatus(404);
    }

    public function test_drivers_aggregation(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $emp = $this->makeUser('employee', $company->id);
        $this->seedPrediction($company->id, $emp->id);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/predictive/drivers')
            ->assertOk()
            ->assertJsonPath('sample', 1)
            ->assertJsonPath('drivers.0.feature', 'tenure');
    }

    public function test_benchmarks_returns_industry_percentiles(): void
    {
        $company = $this->makeCompany(['industry' => 'it']);
        $hrd = $this->makeUser('hrd', $company->id);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/predictive/benchmarks')
            ->assertOk()
            ->assertJsonPath('industry', 'it')
            ->assertJsonStructure(['benchmarks' => [['metric', 'p25', 'p50', 'p75']]]);
    }

    public function test_what_if_simulation_requires_levers(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);

        $this->actingAs($hrd, 'sanctum')
            ->postJson('/api/predictive/what-if', [])
            ->assertStatus(422);

        $this->actingAs($hrd, 'sanctum')
            ->postJson('/api/predictive/what-if', ['levers' => ['comp' => 0.1]])
            ->assertOk();
    }

    public function test_scenario_crud_scoped_to_company(): void
    {
        $company = $this->makeCompany();
        $other = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $foreignHrd = $this->makeUser('hrd', $other->id);

        $create = $this->actingAs($hrd, 'sanctum')->postJson('/api/predictive/scenarios', [
            'name' => 'Повышение зарплат',
            'params' => ['comp' => 0.2],
        ])->assertCreated();

        $id = $create->json('id');
        $this->assertDatabaseHas('whatif_scenarios', ['id' => $id, 'company_id' => $company->id]);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/predictive/scenarios')
            ->assertOk()
            ->assertJsonCount(1);

        // чужая компания не видит и не может удалить сценарий (silent no-op в своей области)
        $this->actingAs($foreignHrd, 'sanctum')
            ->getJson('/api/predictive/scenarios')
            ->assertOk()
            ->assertJsonCount(0);

        $this->actingAs($hrd, 'sanctum')
            ->deleteJson('/api/predictive/scenarios/' . $id)
            ->assertStatus(204);

        $this->assertDatabaseMissing('whatif_scenarios', ['id' => $id]);
    }

    public function test_company_admin_can_manage_but_employee_cannot(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('company_admin', $company->id);
        $employee = $this->makeUser('employee', $company->id);

        $this->actingAs($admin, 'sanctum')->getJson('/api/predictive/employees')->assertOk();
        $this->actingAs($employee, 'sanctum')->postJson('/api/predictive/scenarios', [
            'name' => 'X', 'params' => [],
        ])->assertStatus(403);
    }
}
