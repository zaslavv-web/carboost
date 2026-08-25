<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Position;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    public function test_hrd_lists_only_own_company_positions_without_metadata_queries(): void
    {
        $ownCompany = $this->makeCompany();
        $otherCompany = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $ownCompany->id);

        Position::create([
            'company_id' => $ownCompany->id,
            'created_by' => $hrd->id,
            'title' => 'Own position',
        ]);
        Position::create([
            'company_id' => $otherCompany->id,
            'created_by' => $hrd->id,
            'title' => 'Foreign position',
        ]);

        $metadataQueries = [];
        DB::listen(function ($query) use (&$metadataQueries): void {
            if (preg_match('/SHOW\s+COLUMNS|information_schema|pragma_table_info/i', $query->sql)) {
                $metadataQueries[] = $query->sql;
            }
        });

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/db/positions?select=*&order=title.asc')
            ->assertOk()
            ->assertHeader('X-Db-Read-Path', 'raw-chunked-v4')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Own position');

        $this->assertSame([], $metadataQueries);
    }

    public function test_employee_cannot_create_department(): void
    {
        $emp = $this->makeUser('employee');
        $this->actingAs($emp, 'sanctum')
            ->postJson('/api/db/departments', ['values' => ['name' => 'X']])
            ->assertStatus(403)
            ->assertJsonPath('error', 'Доступ к разделу запрещён ролевой моделью');
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

    public function test_delete_without_filters_is_blocked(): void
    {
        $company = $this->makeCompany();

        $this->actingAs($this->makeUser('superadmin'), 'sanctum')
            ->deleteJson('/api/db/companies')
            ->assertStatus(422)
            ->assertJsonPath('code', 'mass_mutation_blocked');

        $this->assertDatabaseHas('companies', ['id' => $company->id]);
    }

    public function test_delete_company_with_eq_id_deletes_only_that_company(): void
    {
        $target = $this->makeCompany(['name' => 'Delete target']);
        $other = $this->makeCompany(['name' => 'Keep target']);

        $this->actingAs($this->makeUser('superadmin'), 'sanctum')
            ->deleteJson('/api/db/companies?eq.id=' . $target->id)
            ->assertOk()
            ->assertJsonPath('data.deleted', 1);

        $this->assertDatabaseMissing('companies', ['id' => $target->id]);
        $this->assertDatabaseHas('companies', ['id' => $other->id]);
    }

    /**
     * Клиент шлёт `eq.is_active=true`; в MySQL строка 'true' приводилась к 0,
     * из-за чего магазин демо-компании выглядел пустым при живых товарах.
     */
    public function test_boolean_true_filter_matches_active_rows(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        DB::table('shop_products')->insert([
            ['id' => (string) \Illuminate\Support\Str::uuid(), 'company_id' => $company->id, 'title' => 'Активный', 'price' => 100, 'is_active' => true, 'created_by' => $hrd->id, 'created_at' => now(), 'updated_at' => now()],
            ['id' => (string) \Illuminate\Support\Str::uuid(), 'company_id' => $company->id, 'title' => 'Скрытый', 'price' => 100, 'is_active' => false, 'created_by' => $hrd->id, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/db/shop_products?select=*&eq.company_id=' . $company->id . '&eq.is_active=true')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Активный');

        $this->actingAs($hrd, 'sanctum')
            ->getJson('/api/db/shop_products?select=*&eq.company_id=' . $company->id . '&eq.is_active=false')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Скрытый');
    }

    public function test_embedded_select_uses_alias_as_eloquent_relation(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $productId = (string) \Illuminate\Support\Str::uuid();

        DB::table('shop_products')->insert([
            'id' => $productId,
            'company_id' => $company->id,
            'title' => 'Подарочный сертификат',
            'price' => 250,
            'is_active' => true,
            'created_by' => $employee->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('shop_cart_items')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'user_id' => $employee->id,
            'company_id' => $company->id,
            'product_id' => $productId,
            'quantity' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/db/shop_cart_items?select=*,product:shop_products(*)&eq.user_id=' . $employee->id)
            ->assertOk()
            ->assertJsonPath('data.0.product.title', 'Подарочный сертификат');
    }

    public function test_embedded_select_alias_loads_order_items_relation(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $orderId = (string) \Illuminate\Support\Str::uuid();
        $productId = (string) \Illuminate\Support\Str::uuid();

        DB::table('shop_orders')->insert([
            'id' => $orderId,
            'user_id' => $employee->id,
            'company_id' => $company->id,
            'total_amount' => 250,
            'status' => 'pending_fulfillment',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('shop_order_items')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'order_id' => $orderId,
            'product_id' => $productId,
            'quantity' => 1,
            'unit_price' => 250,
            'subtotal' => 250,
            'product_title' => 'Подарочный сертификат',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/db/shop_orders?select=*,items:shop_order_items(*)&eq.user_id=' . $employee->id)
            ->assertOk()
            ->assertJsonPath('data.0.items.0.product_title', 'Подарочный сертификат');
    }

    /**
     * Регрессия: матрица разделов описывает админ-разделы, а не личные данные.
     * Сотрудник обязан видеть опросы/должности/профили и отправлять ответы.
     */
    public function test_employee_can_read_pulse_and_positions_and_answer_survey(): void
    {
        $company = $this->makeCompany();
        $hrd = $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);

        $surveyId = (string) \Illuminate\Support\Str::uuid();
        DB::table('pulse_surveys')->insert([
            'id' => $surveyId, 'company_id' => $company->id, 'created_by' => $hrd->id,
            'title' => 'Пульс недели', 'status' => 'running',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $questionId = (string) \Illuminate\Support\Str::uuid();
        DB::table('pulse_survey_questions')->insert([
            'id' => $questionId, 'company_id' => $company->id, 'survey_id' => $surveyId,
            'title' => 'Как настроение?', 'kind' => 'scale',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        Position::create(['company_id' => $company->id, 'created_by' => $hrd->id, 'title' => 'Аналитик']);

        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/db/pulse_surveys?select=*')->assertOk();
        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/db/pulse_survey_questions?select=*&eq.survey_id=' . $surveyId)->assertOk();
        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/db/positions?select=*')->assertOk();

        $this->actingAs($employee, 'sanctum')
            ->postJson('/api/db/pulse_survey_responses', ['values' => [
                'company_id' => $company->id,
                'survey_id' => $surveyId,
                'question_id' => $questionId,
                'user_id' => $employee->id,
                'value_number' => 8,
            ]])
            ->assertSuccessful();
    }

    public function test_employee_can_read_own_test_attempts(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $otherEmployee = $this->makeUser('employee', $company->id);
        $ownAttemptId = (string) \Illuminate\Support\Str::uuid();

        DB::table('test_attempts')->insert([
            [
                'id' => $ownAttemptId,
                'company_id' => $company->id,
                'user_id' => $employee->id,
                'test_source' => 'hrd',
                'answers' => json_encode([]),
                'competency_breakdown' => json_encode([]),
                'score' => 80,
                'total' => 100,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'company_id' => $company->id,
                'user_id' => $otherEmployee->id,
                'test_source' => 'hrd',
                'answers' => json_encode([]),
                'competency_breakdown' => json_encode([]),
                'score' => 10,
                'total' => 100,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/db/test_attempts?select=id,score,total&order=score.desc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownAttemptId)
            ->assertJsonPath('data.0.score', 80);
    }
}
