<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

class ProfileDirectoryTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_hrd_gets_own_company_directory_with_email_and_roles(): void
    {
        $ownCompany = $this->makeCompany();
        $otherCompany = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $ownCompany->id);
        $employee = $this->makeUser('employee', $ownCompany->id);
        $foreign = $this->makeUser('employee', $otherCompany->id);

        $response = $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/profiles?per_page=50&company_id=' . $otherCompany->id);

        $response->assertOk()
            ->assertHeader('X-Profile-Read-Path', 'raw-chunked-v2')
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['user_id' => $employee->id, 'roles' => ['employee']])
            ->assertJsonMissing(['user_id' => $foreign->id])
            ->assertJsonPath('has_more', false);

        $row = collect($response->json('data'))->firstWhere('user_id', $employee->id);
        $this->assertNotEmpty($row['email'] ?? null);
    }

    public function test_directory_paginates_without_materializing_the_whole_company(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $now = now();
        $users = [];
        $profiles = [];
        $roles = [];

        for ($i = 0; $i < 55; $i++) {
            $id = (string) Str::uuid();
            $users[] = [
                'id' => $id,
                'email' => "directory-{$i}@test.local",
                'password' => 'unused',
                'meta' => json_encode([]),
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $profiles[] = [
                'id' => (string) Str::uuid(),
                'user_id' => $id,
                'full_name' => sprintf('Employee %03d', $i),
                'company_id' => $company->id,
                'is_verified' => true,
                'requested_role' => 'employee',
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $roles[] = ['id' => (string) Str::uuid(), 'user_id' => $id, 'role' => 'employee'];
        }

        DB::table('users')->insert($users);
        DB::table('profiles')->insert($profiles);
        DB::table('user_roles')->insert($roles);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/profiles?per_page=50&page=1')
            ->assertOk()
            ->assertJsonCount(50, 'data')
            ->assertJsonPath('has_more', true)
            ->assertJsonPath('per_page', 50);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/profiles?per_page=50&page=2')
            ->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonPath('has_more', false);
    }

    public function test_per_page_is_capped_and_large_values_do_not_5xx(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);

        // per_page=500 (максимум) не должен приводить к ошибке сервера
        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/profiles?per_page=500')
            ->assertOk()
            ->assertJsonPath('per_page', 500);

        // запрошенное значение выше потолка обрезается до 500, а не падает
        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/profiles?per_page=100000')
            ->assertOk()
            ->assertJsonPath('per_page', 500);

        // значение меньше 1 приводится к минимуму 1, а не к ошибке
        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/profiles?per_page=0')
            ->assertOk()
            ->assertJsonPath('per_page', 1);
    }
}
