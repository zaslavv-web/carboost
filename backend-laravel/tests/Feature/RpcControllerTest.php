<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

class RpcControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_unknown_rpc_returns_404(): void
    {
        $this->actingAs($this->makeUser('superadmin'), 'sanctum')
            ->postJson('/api/rpc/no_such_function', ['params' => []])
            ->assertStatus(404)
            ->assertJsonPath('error', "RPC 'no_such_function' не зарегистрирован");
    }

    public function test_submit_demo_request_is_public(): void
    {
        $res = $this->postJson('/api/rpc/submit_demo_request', [
            'params' => [
                '_name' => 'Ivan', '_email' => 'i@v.an',
                '_company' => 'Co', '_headcount' => 10, '_source' => 'landing',
            ],
        ]);
        $res->assertOk()->assertJsonStructure(['data' => ['id']]);
        $this->assertDatabaseHas('demo_requests', ['email' => 'i@v.an', 'name' => 'Ivan']);
    }

    public function test_submit_pricing_inquiry_is_public(): void
    {
        $res = $this->postJson('/api/rpc/submit_pricing_inquiry', [
            'params' => [
                '_name' => 'Ivan', '_email' => 'i@v.an', '_plan' => 'pro',
                '_company' => 'Co', '_headcount' => 50, '_source' => 'pricing_page',
            ],
        ]);
        $res->assertOk()->assertJsonStructure(['data' => ['id']]);
        $this->assertDatabaseHas('pricing_inquiries', ['email' => 'i@v.an', 'plan' => 'pro']);
    }

    public function test_submit_test_attempt_scores_on_server_and_persists_attempt(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        $testId = (string) Str::uuid();

        DB::table('closed_question_tests')->insert([
            'id' => $testId,
            'company_id' => $company->id,
            'title' => 'Тест коммуникации',
            'questions' => json_encode([
                ['id' => 'q1', 'text' => '1', 'competency' => 'Коммуникация', 'weight' => 1, 'options' => [], 'correct_option_id' => 'a'],
                ['id' => 'q2', 'text' => '2', 'competency' => 'Коммуникация', 'weight' => 1, 'options' => [], 'correct_option_id' => 'b'],
            ]),
            'is_active' => true,
            'created_by' => $hrd->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->postJson('/api/rpc/submit_test_attempt', ['params' => [
                '_test_id' => $testId,
                '_source' => 'hrd',
                '_answers' => ['q1' => 'a', 'q2' => 'c'],
            ]])
            ->assertOk()
            ->assertJsonPath('data.score', 50)
            ->assertJsonPath('data.total', 100)
            ->assertJsonPath('data.breakdown.0.score', 50);

        $this->assertDatabaseHas('test_attempts', [
            'user_id' => $employee->id,
            'company_id' => $company->id,
            'test_id' => $testId,
            'score' => 50,
            'total' => 100,
        ]);
    }

    public function test_submit_test_attempt_rejects_other_company_test(): void
    {
        $ownCompany = $this->makeCompany();
        $otherCompany = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $otherCompany->id);
        $employee = $this->makeUser('employee', $ownCompany->id);
        $testId = (string) Str::uuid();

        DB::table('closed_question_tests')->insert([
            'id' => $testId,
            'company_id' => $otherCompany->id,
            'title' => 'Чужой тест',
            'questions' => json_encode([]),
            'is_active' => true,
            'created_by' => $hrd->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->postJson('/api/rpc/submit_test_attempt', ['params' => [
                '_test_id' => $testId,
                '_source' => 'hrd',
                '_answers' => [],
            ]])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Недостаточно прав');
    }


    public function test_rpc_localizes_postgres_rls_error(): void
    {
        // Пользователя создаём до подмены фасада DB — makeUser() пишет через DB::table().
        $user = $this->makeUser('employee');

        DB::shouldReceive('statement')->zeroOrMoreTimes()->andReturnTrue();
        DB::shouldReceive('select')->andThrow(new \RuntimeException(
            'SQLSTATE[42501]: insufficient_privilege: 7 ERROR: new row violates row-level security policy for table'
        ));

        // register_company идёт по общему SQL-пути (DB::select), где и работает локализация.
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/rpc/register_company', ['params' => ['_name' => 'ООО Тест']])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Недостаточно прав для этой операции');
    }
}
