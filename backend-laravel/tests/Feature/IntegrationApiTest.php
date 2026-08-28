<?php

namespace Tests\Feature;

use App\Models\ApiKey;
use App\Models\Department;
use App\Models\IntegrationEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/** Интеграционное API: авторизация ключом, скоупы, изоляция компаний, события. */
class IntegrationApiTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    private const BASE = '/api/integration/v1';

    /** @return array{0:string,1:\App\Models\ApiKey} Полный токен и сам ключ. */
    private function makeKey(string $companyId, array $scopes = ['*']): array
    {
        $prefix = Str::lower(Str::random(12));
        $secret = Str::random(48);

        $key = ApiKey::create([
            'company_id' => $companyId,
            'name'       => 'Тестовый ключ',
            'prefix'     => $prefix,
            'token_hash' => hash('sha256', $secret),
            'scopes'     => $scopes,
        ]);

        return ["gp_{$prefix}_{$secret}", $key];
    }

    private function withKey(string $token): array
    {
        return ['Authorization' => 'Bearer ' . $token];
    }

    private function makeDepartment(string $companyId, string $name = 'Отдел'): Department
    {
        return Department::withoutGlobalScopes()->create([
            'id'         => (string) Str::uuid(),
            'company_id' => $companyId,
            'name'       => $name,
        ]);
    }

    // ------------------------------------------------------------ авторизация

    public function test_request_without_key_is_rejected(): void
    {
        $this->getJson(self::BASE . '/departments')->assertStatus(401);
    }

    public function test_malformed_and_unknown_keys_are_rejected(): void
    {
        $this->getJson(self::BASE . '/departments', $this->withKey('not-a-key'))->assertStatus(401);
        $this->getJson(self::BASE . '/departments', $this->withKey('gp_missing_secret'))->assertStatus(401);
    }

    public function test_revoked_and_expired_keys_are_rejected(): void
    {
        $company = $this->makeCompany();

        [$revokedToken, $revoked] = $this->makeKey($company->id);
        $revoked->forceFill(['revoked_at' => now()])->save();
        $this->getJson(self::BASE . '/departments', $this->withKey($revokedToken))->assertStatus(401);

        [$expiredToken, $expired] = $this->makeKey($company->id);
        $expired->forceFill(['expires_at' => now()->subDay()])->save();
        $this->getJson(self::BASE . '/departments', $this->withKey($expiredToken))->assertStatus(401);
    }

    public function test_scope_is_required_for_read_and_write(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id, ['departments:read']);
        $this->makeDepartment($company->id);

        $this->getJson(self::BASE . '/departments', $this->withKey($token))->assertOk();

        $this->postJson(self::BASE . '/departments', ['name' => 'Новый'], $this->withKey($token))
            ->assertStatus(403);
    }

    public function test_domain_wildcard_scope_covers_read_and_write(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id, ['departments:*']);

        $this->postJson(self::BASE . '/departments', ['name' => 'Логистика'], $this->withKey($token))
            ->assertStatus(201);
    }

    // ------------------------------------------------------- изоляция компаний

    public function test_key_never_sees_another_company_records(): void
    {
        $mine = $this->makeCompany();
        $foreign = $this->makeCompany();
        $this->makeDepartment($mine->id, 'Мой отдел');
        $foreignDept = $this->makeDepartment($foreign->id, 'Чужой отдел');

        [$token] = $this->makeKey($mine->id);

        $response = $this->getJson(self::BASE . '/departments', $this->withKey($token))->assertOk();
        $names = array_column($response->json('data'), 'name');
        $this->assertSame(['Мой отдел'], $names);

        // Прямое обращение по идентификатору чужой записи тоже закрыто.
        $this->getJson(self::BASE . '/departments/' . $foreignDept->id, $this->withKey($token))
            ->assertStatus(404);

        $this->patchJson(self::BASE . '/departments/' . $foreignDept->id, ['name' => 'Взлом'], $this->withKey($token))
            ->assertStatus(404);
    }

    public function test_created_record_belongs_to_the_key_company(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);

        $id = $this->postJson(self::BASE . '/departments', ['name' => 'Финансы'], $this->withKey($token))
            ->assertStatus(201)
            ->json('data.id');

        $this->assertSame(
            $company->id,
            DB::table('departments')->where('id', $id)->value('company_id'),
        );
    }

    // ------------------------------------------------------------ поля и CRUD

    public function test_only_declared_fields_are_accepted_and_returned(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);

        $data = $this->postJson(self::BASE . '/departments', [
            'name'       => 'Продажи',
            'company_id' => (string) Str::uuid(), // не входит в write — должно игнорироваться
        ], $this->withKey($token))->assertStatus(201)->json('data');

        $this->assertSame($company->id, $data['company_id']);
        $this->assertArrayNotHasKey('created_by', $data);
    }

    public function test_update_and_delete_roundtrip(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);
        $dept = $this->makeDepartment($company->id, 'Старое имя');

        $this->patchJson(self::BASE . '/departments/' . $dept->id, ['name' => 'Новое имя'], $this->withKey($token))
            ->assertOk()
            ->assertJsonPath('data.name', 'Новое имя');

        $this->deleteJson(self::BASE . '/departments/' . $dept->id, [], $this->withKey($token))
            ->assertOk();

        $this->assertDatabaseMissing('departments', ['id' => $dept->id]);
    }

    public function test_unknown_resource_returns_404(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);

        $this->getJson(self::BASE . '/unicorns', $this->withKey($token))->assertStatus(404);
    }

    // ------------------------------------------------------------ внешние ID

    public function test_upsert_is_idempotent_by_external_id(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);

        $first = $this->postJson(self::BASE . '/departments/upsert', [
            'external_system' => '1c_zup',
            'external_id'     => 'DEP-42',
            'data'            => ['name' => 'Склад'],
        ], $this->withKey($token))->assertStatus(201)->json();

        $this->assertTrue($first['created']);

        $second = $this->postJson(self::BASE . '/departments/upsert', [
            'external_system' => '1c_zup',
            'external_id'     => 'DEP-42',
            'data'            => ['name' => 'Склад и логистика'],
        ], $this->withKey($token))->assertOk()->json();

        $this->assertFalse($second['created']);
        $this->assertSame($first['data']['id'], $second['data']['id']);
        $this->assertSame(1, DB::table('departments')->where('company_id', $company->id)->count());
        $this->assertSame('Склад и логистика', DB::table('departments')->where('id', $first['data']['id'])->value('name'));
    }

    public function test_record_is_addressable_by_external_id(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);

        $this->postJson(self::BASE . '/departments/upsert', [
            'external_system' => 'sap',
            'external_id'     => 'X-1',
            'data'            => ['name' => 'Кадры'],
        ], $this->withKey($token))->assertStatus(201);

        $this->getJson(self::BASE . '/departments/ext:sap:X-1', $this->withKey($token))
            ->assertOk()
            ->assertJsonPath('data.name', 'Кадры');
    }

    public function test_external_id_of_another_company_is_not_reachable(): void
    {
        $mine = $this->makeCompany();
        $foreign = $this->makeCompany();

        [$foreignToken] = $this->makeKey($foreign->id);
        $this->postJson(self::BASE . '/departments/upsert', [
            'external_system' => 'sap',
            'external_id'     => 'SHARED-1',
            'data'            => ['name' => 'Чужой'],
        ], $this->withKey($foreignToken))->assertStatus(201);

        [$myToken] = $this->makeKey($mine->id);
        $this->getJson(self::BASE . '/departments/ext:sap:SHARED-1', $this->withKey($myToken))
            ->assertStatus(404);
    }

    // ------------------------------------------------------- идемпотентность

    public function test_idempotency_key_prevents_duplicate_creation(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);
        $headers = $this->withKey($token) + ['Idempotency-Key' => 'order-1'];

        $first = $this->postJson(self::BASE . '/departments', ['name' => 'Дубль'], $headers)->assertStatus(201);
        $second = $this->postJson(self::BASE . '/departments', ['name' => 'Дубль'], $headers)->assertStatus(201);

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, DB::table('departments')->where('company_id', $company->id)->count());
    }

    // -------------------------------------------------------------- события

    public function test_changes_from_any_source_land_in_the_event_feed(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id, ['departments:*', 'events:read']);

        // Запись сделана мимо интеграционного API — событие всё равно должно быть.
        $dept = $this->makeDepartment($company->id, 'Отдел A');
        $dept->update(['name' => 'Отдел Б']);

        $events = $this->getJson(self::BASE . '/events', $this->withKey($token))->assertOk()->json('data');
        $names = array_column($events, 'event');

        $this->assertContains('departments.created', $names);
        $this->assertContains('departments.updated', $names);
    }

    public function test_event_feed_is_scoped_and_advances_by_cursor(): void
    {
        $mine = $this->makeCompany();
        $foreign = $this->makeCompany();
        [$token] = $this->makeKey($mine->id, ['events:read']);

        $this->makeDepartment($mine->id, 'Мой');
        $this->makeDepartment($foreign->id, 'Чужой');

        $first = $this->getJson(self::BASE . '/events', $this->withKey($token))->assertOk()->json();

        foreach ($first['data'] as $event) {
            $this->assertSame('departments', $event['resource']);
            $this->assertSame('Мой', $event['data']['name']);
        }

        // Повторный запрос с курсором не отдаёт уже прочитанное.
        $cursor = $first['page']['next_cursor'];
        $this->getJson(self::BASE . '/events?since=' . $cursor, $this->withKey($token))
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_event_feed_requires_its_own_scope(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id, ['departments:read']);

        $this->getJson(self::BASE . '/events', $this->withKey($token))->assertStatus(403);
    }

    public function test_touching_updated_at_alone_does_not_emit_event(): void
    {
        $company = $this->makeCompany();
        $dept = $this->makeDepartment($company->id);
        IntegrationEvent::query()->delete();

        $dept->touch();

        $this->assertSame(0, IntegrationEvent::query()->count());
    }

    // ------------------------------------------------------------ самоописание

    public function test_meta_reports_granted_scopes(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id, ['departments:read']);

        $body = $this->getJson(self::BASE . '/meta/resources', $this->withKey($token))->assertOk()->json();

        $departments = collect($body['resources'])->firstWhere('name', 'departments');
        $this->assertTrue($departments['granted']['read']);
        $this->assertFalse($departments['granted']['write']);
        $this->assertContains('departments.created', $body['events']);
    }

    public function test_openapi_document_covers_registry(): void
    {
        $company = $this->makeCompany();
        [$token] = $this->makeKey($company->id);

        $body = $this->getJson(self::BASE . '/openapi.json', $this->withKey($token))->assertOk()->json();

        $this->assertSame('3.0.3', $body['openapi']);
        $this->assertArrayHasKey('/api/integration/v1/departments', $body['paths']);
        $this->assertArrayHasKey('/api/integration/v1/events', $body['paths']);
    }
}
