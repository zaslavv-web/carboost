<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Tests\WithDomainUsers;

/** TalentReviewController: 9-box, права HRD/HR/admin, скоуп по компании. */
class TalentReviewControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_employee_cannot_create_session(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);

        $this->actingAs($employee, 'sanctum')
            ->postJson('/api/talent-review/sessions', ['title' => 'Калибровка Q1'])
            ->assertStatus(403);
    }

    public function test_hrd_can_create_session_and_view_grid_scoped_to_own_company(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        DB::table('profiles')->where('user_id', $employee->id)->update(['overall_score' => 90]);

        $create = $this->actingAs($hrd, 'sanctum')
            ->postJson('/api/talent-review/sessions', ['title' => 'Калибровка Q1', 'grid_type' => '9box'])
            ->assertCreated();
        $sessionId = $create->json('id');

        $grid = $this->actingAs($hrd, 'sanctum')
            ->getJson("/api/talent-review/sessions/{$sessionId}/grid")
            ->assertOk();

        $this->assertSame(3, $grid->json('cols'));
        $userIds = collect($grid->json('rows'))->pluck('user_id')->all();
        $this->assertContains($employee->id, $userIds);
    }

    public function test_hr_role_can_save_ratings_and_compute_box(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);
        $employee = $this->makeUser('employee', $company->id);

        $sessionId = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/talent-review/sessions', ['title' => 'Сессия'])
            ->assertCreated()->json('id');

        $this->actingAs($hr, 'sanctum')->postJson("/api/talent-review/sessions/{$sessionId}/ratings", [
            'ratings' => [[
                'user_id' => $employee->id,
                'perf_level' => 3,
                'pot_level' => 3,
            ]],
        ])->assertOk();

        $this->assertDatabaseHas('talent_review_ratings', [
            'session_id' => $sessionId, 'user_id' => $employee->id, 'perf_level' => 3, 'pot_level' => 3,
        ]);
    }

    public function test_session_from_another_company_is_not_found(): void
    {
        $companyA = $this->makeCompany();
        $companyB = $this->makeCompany();
        $hrdA = $this->makeUser('hrd', $companyA->id);
        $hrdB = $this->makeUser('hrd', $companyB->id);

        $sessionId = $this->actingAs($hrdA, 'sanctum')
            ->postJson('/api/talent-review/sessions', ['title' => 'Сессия A'])
            ->assertCreated()->json('id');

        $this->actingAs($hrdB, 'sanctum')
            ->getJson("/api/talent-review/sessions/{$sessionId}/grid")
            ->assertStatus(404);
    }
}
