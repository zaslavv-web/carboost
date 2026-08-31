<?php

namespace Tests\Feature;

use App\Models\ApiKey;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/**
 * Выпуск ключей и выбор компании.
 *
 * Компания ключа определяет, какие данные он увидит, поэтому здесь проверяется
 * не удобство формы, а граница доступа: администратор одной компании не должен
 * получить ключ к данным другой ни при каких входных данных.
 */
class ApiKeyCompanyTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    private function makeKey(string $companyId, string $name = 'ключ'): ApiKey
    {
        return ApiKey::create([
            'company_id' => $companyId,
            'name'       => $name,
            'prefix'     => Str::lower(Str::random(12)),
            'token_hash' => hash('sha256', Str::random(48)),
            'scopes'     => ['departments:read'],
        ]);
    }

    /** Суперадмин без собственной компании — обычная ситуация в проде. */
    private function makeSuperadmin(): \App\Models\User
    {
        $user = $this->makeUser('superadmin');
        DB::table('profiles')->where('user_id', $user->id)->update(['company_id' => null]);

        return $user;
    }

    // ------------------------------------------------------------ создание

    public function test_admin_key_belongs_to_own_company(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('company_admin', $company->id);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/integrations/api-keys', ['name' => 'ключ', 'scopes' => ['departments:read']])
            ->assertStatus(201);

        $this->assertSame($company->id, DB::table('api_keys')->value('company_id'));
    }

    public function test_admin_cannot_issue_key_for_another_company(): void
    {
        $mine = $this->makeCompany();
        $foreign = $this->makeCompany();
        $admin = $this->makeUser('company_admin', $mine->id);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/integrations/api-keys', [
                'name' => 'чужой', 'scopes' => ['departments:read'], 'company_id' => $foreign->id,
            ])
            ->assertStatus(403)
            ->assertJsonPath('error', 'forbidden_company');

        $this->assertSame(0, DB::table('api_keys')->count());
    }

    public function test_superadmin_issues_key_for_chosen_company(): void
    {
        $target = $this->makeCompany(['name' => 'Клиент']);
        $superadmin = $this->makeSuperadmin();

        $body = $this->actingAs($superadmin, 'sanctum')
            ->postJson('/api/integrations/api-keys', [
                'name' => 'для клиента', 'scopes' => ['departments:read'], 'company_id' => $target->id,
            ])
            ->assertStatus(201)
            ->json();

        $this->assertSame($target->id, $body['company_id']);
        $this->assertSame('Клиент', $body['company_name']);
        $this->assertStringStartsWith('gp_', $body['token']);
    }

    public function test_superadmin_without_company_must_choose_one(): void
    {
        $superadmin = $this->makeSuperadmin();

        $this->actingAs($superadmin, 'sanctum')
            ->postJson('/api/integrations/api-keys', ['name' => 'ключ', 'scopes' => ['departments:read']])
            ->assertStatus(422)
            ->assertJsonPath('error', 'company_required');
    }

    public function test_unknown_company_is_rejected(): void
    {
        $superadmin = $this->makeSuperadmin();

        $this->actingAs($superadmin, 'sanctum')
            ->postJson('/api/integrations/api-keys', [
                'name' => 'ключ', 'scopes' => ['departments:read'], 'company_id' => (string) Str::uuid(),
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'unknown_company');
    }

    // ------------------------------------------------------------- список

    public function test_admin_sees_only_own_company_keys(): void
    {
        $mine = $this->makeCompany();
        $foreign = $this->makeCompany();
        $this->makeKey($mine->id, 'мой');
        $this->makeKey($foreign->id, 'чужой');

        $rows = $this->actingAs($this->makeUser('company_admin', $mine->id), 'sanctum')
            ->getJson('/api/integrations/api-keys')
            ->assertOk()
            ->json();

        $this->assertSame(['мой'], array_column($rows, 'name'));
    }

    public function test_superadmin_sees_all_and_can_filter(): void
    {
        $first = $this->makeCompany(['name' => 'Первая']);
        $second = $this->makeCompany(['name' => 'Вторая']);
        $this->makeKey($first->id, 'ключ-1');
        $this->makeKey($second->id, 'ключ-2');
        $superadmin = $this->makeSuperadmin();

        $all = $this->actingAs($superadmin, 'sanctum')
            ->getJson('/api/integrations/api-keys')->assertOk()->json();
        $this->assertCount(2, $all);
        // Название компании нужно, иначе список — набор непонятных UUID.
        $this->assertEqualsCanonicalizing(['Первая', 'Вторая'], array_column($all, 'company_name'));

        $filtered = $this->actingAs($superadmin, 'sanctum')
            ->getJson('/api/integrations/api-keys?company_id=' . $second->id)->assertOk()->json();
        $this->assertSame(['ключ-2'], array_column($filtered, 'name'));
    }

    // ------------------------------------------------------------- отзыв

    public function test_admin_cannot_revoke_foreign_key(): void
    {
        $mine = $this->makeCompany();
        $foreign = $this->makeCompany();
        $key = $this->makeKey($foreign->id);

        $this->actingAs($this->makeUser('company_admin', $mine->id), 'sanctum')
            ->deleteJson('/api/integrations/api-keys/' . $key->id)
            ->assertStatus(404);

        $this->assertNull(DB::table('api_keys')->where('id', $key->id)->value('revoked_at'));
    }

    public function test_superadmin_can_revoke_any_key(): void
    {
        $key = $this->makeKey($this->makeCompany()->id);

        $this->actingAs($this->makeSuperadmin(), 'sanctum')
            ->deleteJson('/api/integrations/api-keys/' . $key->id)
            ->assertOk();

        $this->assertNotNull(DB::table('api_keys')->where('id', $key->id)->value('revoked_at'));
    }

    // ------------------------------------------------------- выбор компаний

    public function test_companies_list_is_scoped_to_role(): void
    {
        $mine = $this->makeCompany(['name' => 'Моя']);
        $this->makeCompany(['name' => 'Другая']);

        $own = $this->actingAs($this->makeUser('company_admin', $mine->id), 'sanctum')
            ->getJson('/api/integrations/api-keys/companies')->assertOk()->json();
        $this->assertFalse($own['is_superadmin']);
        $this->assertSame(['Моя'], array_column($own['companies'], 'name'));

        $all = $this->actingAs($this->makeSuperadmin(), 'sanctum')
            ->getJson('/api/integrations/api-keys/companies')->assertOk()->json();
        $this->assertTrue($all['is_superadmin']);
        $this->assertGreaterThanOrEqual(2, count($all['companies']));
    }

    public function test_employee_has_no_access(): void
    {
        $company = $this->makeCompany();

        $this->actingAs($this->makeUser('employee', $company->id), 'sanctum')
            ->getJson('/api/integrations/api-keys/companies')
            ->assertStatus(403);
    }
}
