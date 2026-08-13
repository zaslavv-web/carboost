<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

class EmployeeReadControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_today_returns_only_effective_users_compact_data(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $other = $this->makeUser('employee', $company->id);

        $this->insertTodayData($employee->id, $company->id, 'Mine');
        $this->insertTodayData($other->id, $company->id, 'Other');

        $response = $this->actingAs($employee, 'sanctum')->getJson('/api/employee/today');

        $response->assertOk()
            ->assertHeader('X-Db-Read-Path', 'owner-light-v2')
            ->assertJsonCount(1, 'tasks')
            ->assertJsonCount(1, 'notifications')
            ->assertJsonCount(1, 'competencies')
            ->assertJsonCount(1, 'goals')
            ->assertJsonPath('tasks.0.title', 'Mine task')
            ->assertJsonPath('notifications.0.title', 'Mine notification')
            ->assertJsonPath('competencies.0.skill_value', 80)
            ->assertJsonPath('goals.0.status', 'completed')
            ->assertJsonPath('goals.0.progress', 100)
            ->assertJsonPath('unread_count', 1);
    }

    private function insertTodayData(string $userId, string $companyId, string $prefix): void
    {
        $now = now();
        DB::table('tracker_tasks')->insert([
            'id' => (string) Str::uuid(), 'company_id' => $companyId,
            'author_id' => $userId, 'assignee_id' => $userId,
            'title' => $prefix . ' task', 'status' => 'published',
            'urgency' => 'medium', 'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('notifications')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $userId,
            'company_id' => $companyId, 'title' => $prefix . ' notification',
            'notification_type' => 'info', 'is_read' => false,
            'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('competencies')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $userId,
            'company_id' => $companyId, 'skill_name' => $prefix,
            'skill_value' => 80, 'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('career_goals')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $userId,
            'company_id' => $companyId, 'title' => $prefix . ' goal',
            'status' => 'completed', 'progress' => 100,
            'created_at' => $now, 'updated_at' => $now,
        ]);
    }
}