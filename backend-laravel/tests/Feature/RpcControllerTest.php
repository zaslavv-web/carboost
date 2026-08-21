<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
