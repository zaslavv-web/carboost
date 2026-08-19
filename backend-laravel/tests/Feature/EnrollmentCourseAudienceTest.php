<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/**
 * EnrollmentController + CourseController audience_rules: массовое назначение
 * курса по отделам/должностям/пользователям, идемпотентность повторного назначения.
 */
class EnrollmentCourseAudienceTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    private function makeCourse(string $companyId, array $attrs = []): string
    {
        $id = (string) Str::uuid();
        DB::table('courses')->insert(array_merge([
            'id' => $id,
            'company_id' => $companyId,
            'title' => 'Курс',
            'slug' => 'course-' . substr($id, 0, 6),
            'status' => 'published',
            'level' => 'beginner',
            'duration_min' => 0,
            'mandatory' => false,
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
        return $id;
    }

    public function test_bulk_assign_by_department_creates_enrollments_for_matching_employees(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $inDept = $this->makeUser('employee', $company->id);
        $outDept = $this->makeUser('employee', $company->id);

        DB::table('profiles')->where('user_id', $inDept->id)->update(['department' => 'Продажи']);
        DB::table('profiles')->where('user_id', $outDept->id)->update(['department' => 'Разработка']);

        $courseId = $this->makeCourse($company->id);

        $response = $this->actingAs($hrd, 'sanctum')
            ->postJson("/api/university/courses/{$courseId}/assign", ['departments' => ['Продажи']])
            ->assertOk();

        $this->assertSame(1, $response->json('created'));
        $this->assertDatabaseHas('enrollments', ['course_id' => $courseId, 'user_id' => $inDept->id]);
        $this->assertDatabaseMissing('enrollments', ['course_id' => $courseId, 'user_id' => $outDept->id]);
    }

    public function test_bulk_assign_by_position_ids(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        $positionId = (string) Str::uuid();

        DB::table('positions')->insert([
            'id' => $positionId, 'title' => 'Менеджер', 'created_by' => $hrd->id,
            'company_id' => $company->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('profiles')->where('user_id', $employee->id)->update(['position_id' => $positionId]);

        $courseId = $this->makeCourse($company->id);

        $this->actingAs($hrd, 'sanctum')
            ->postJson("/api/university/courses/{$courseId}/assign", ['position_ids' => [$positionId]])
            ->assertOk()
            ->assertJsonPath('created', 1);

        $this->assertDatabaseHas('enrollments', ['course_id' => $courseId, 'user_id' => $employee->id]);
    }

    public function test_repeated_assign_does_not_duplicate_enrollments(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        DB::table('profiles')->where('user_id', $employee->id)->update(['department' => 'Продажи']);
        $courseId = $this->makeCourse($company->id);

        $this->actingAs($hrd, 'sanctum')
            ->postJson("/api/university/courses/{$courseId}/assign", ['departments' => ['Продажи']])
            ->assertOk()->assertJsonPath('created', 1);

        $response = $this->actingAs($hrd, 'sanctum')
            ->postJson("/api/university/courses/{$courseId}/assign", ['departments' => ['Продажи']])
            ->assertOk();

        $this->assertSame(0, $response->json('created'));
        $this->assertSame(1, $response->json('skipped'));
        $this->assertSame(1, DB::table('enrollments')
            ->where('course_id', $courseId)->where('user_id', $employee->id)->count());
    }

    public function test_bulk_assign_forbidden_for_plain_employee(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $courseId = $this->makeCourse($company->id);

        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/university/courses/{$courseId}/assign", ['departments' => ['Продажи']])
            ->assertStatus(403);
    }

    public function test_bulk_assign_rejects_course_from_another_company(): void
    {
        $company = $this->makeCompany();
        $otherCompany = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $courseId = $this->makeCourse($otherCompany->id);

        $this->actingAs($hrd, 'sanctum')
            ->postJson("/api/university/courses/{$courseId}/assign", ['departments' => ['Продажи']])
            ->assertStatus(403);
    }

    public function test_assign_preview_reports_totals_without_creating_enrollments(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        DB::table('profiles')->where('user_id', $employee->id)->update(['department' => 'Продажи']);
        $courseId = $this->makeCourse($company->id);

        $response = $this->actingAs($hrd, 'sanctum')
            ->postJson("/api/university/courses/{$courseId}/assign/preview", ['departments' => ['Продажи']])
            ->assertOk();

        $this->assertSame(1, $response->json('total'));
        $this->assertSame(1, $response->json('to_enroll'));
        $this->assertDatabaseMissing('enrollments', ['course_id' => $courseId, 'user_id' => $employee->id]);
    }
}
