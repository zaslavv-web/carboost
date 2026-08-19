<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/** KedoController: маршрут, подписание (OTP/ПЭП), целостность hash-chain kedo_events. */
class KedoControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_hr_creates_route_with_steps(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);

        $response = $this->actingAs($hr, 'sanctum')->postJson('/api/kedo/routes', [
            'title' => 'Согласование отпуска',
            'steps' => [
                ['step_order' => 1, 'actor_type' => 'subject', 'action' => 'sign'],
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('kedo_routes', ['id' => $response->json('id'), 'company_id' => $company->id]);
        $this->assertDatabaseHas('kedo_route_steps', ['route_id' => $response->json('id'), 'actor_type' => 'subject']);
    }

    public function test_employee_cannot_create_route(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);

        $this->actingAs($employee, 'sanctum')
            ->postJson('/api/kedo/routes', ['title' => 'X', 'steps' => []])
            ->assertStatus(403);
    }

    public function test_otp_signing_flow_appends_valid_hash_chain(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);
        $employee = $this->makeUser('employee', $company->id);

        $templateId = (string) Str::uuid();
        DB::table('kedo_templates')->insert([
            'id' => $templateId, 'company_id' => $company->id, 'code' => 'custom_test',
            'title' => 'Заявление', 'category' => 'other', 'body_html' => 'Текст документа',
            'requires_signature' => true, 'signature_kind' => 'pep', 'retention_years' => 75,
            'is_system' => false, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $bulk = $this->actingAs($hr, 'sanctum')->postJson('/api/kedo/documents/bulk', [
            'template_id' => $templateId,
            'scope_type' => 'user',
            'user_ids' => [$employee->id],
            'send' => true,
        ])->assertCreated();
        $this->assertSame(1, $bulk->json('created'));

        $doc = DB::table('kedo_documents')->where('template_id', $templateId)->first();
        $this->assertNotNull($doc);
        $this->assertSame('in_review', $doc->status);

        // Сотрудник запрашивает код и подписывает документ (сам себе - без маршрута).
        $otp = $this->actingAs($employee, 'sanctum')
            ->postJson("/api/kedo/documents/{$doc->id}/otp")
            ->assertOk();
        $code = $otp->json('code');
        $this->assertNotEmpty($code);

        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/kedo/documents/{$doc->id}/sign-pep", ['code' => $code])
            ->assertOk()->assertJsonPath('ok', true);

        $verify = $this->actingAs($employee, 'sanctum')
            ->getJson("/api/kedo/documents/{$doc->id}/verify")
            ->assertOk();

        $this->assertTrue($verify->json('ok'));
        $this->assertNull($verify->json('broken_event_id'));
        $this->assertGreaterThanOrEqual(3, $verify->json('events')); // created, sent, signed_pep
    }

    public function test_tampered_event_breaks_hash_chain_verification(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);
        $employee = $this->makeUser('employee', $company->id);

        $templateId = (string) Str::uuid();
        DB::table('kedo_templates')->insert([
            'id' => $templateId, 'company_id' => $company->id, 'code' => 'custom_test2',
            'title' => 'Заявление', 'category' => 'other', 'body_html' => 'Текст',
            'requires_signature' => true, 'signature_kind' => 'pep', 'retention_years' => 75,
            'is_system' => false, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($hr, 'sanctum')->postJson('/api/kedo/documents/bulk', [
            'template_id' => $templateId,
            'scope_type' => 'user',
            'user_ids' => [$employee->id],
            'send' => true,
        ])->assertCreated();

        $doc = DB::table('kedo_documents')->where('template_id', $templateId)->first();

        // Портим один из уже записанных событий журнала.
        $event = DB::table('kedo_events')->where('document_id', $doc->id)->orderBy('created_at')->first();
        DB::table('kedo_events')->where('id', $event->id)->update(['hash' => str_repeat('0', 64)]);

        $verify = $this->actingAs($hr, 'sanctum')
            ->getJson("/api/kedo/documents/{$doc->id}/verify")
            ->assertOk();

        $this->assertFalse($verify->json('ok'));
        $this->assertSame($event->id, $verify->json('broken_event_id'));
    }
}
