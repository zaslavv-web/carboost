<?php

namespace Tests\Feature;

use App\Services\AI\AiGatewayException;
use App\Services\AI\AssessmentChatService;
use App\Services\AI\DocumentParserService;
use App\Services\AI\GenerateClosedTestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;
use Tests\WithDomainUsers;

class AiControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_requires_auth(): void
    {
        $this->postJson('/api/ai/generate-closed-test', [])->assertStatus(401);
    }

    public function test_generate_closed_test_validates_input(): void
    {
        $this->actingAs($this->makeUser('hrd'), 'sanctum')
            ->postJson('/api/ai/generate-closed-test', [
                'positionTitle' => str_repeat('x', 1000), // overflow
            ])->assertStatus(422);
    }

    public function test_generate_closed_test_returns_service_payload(): void
    {
        $mock = Mockery::mock(GenerateClosedTestService::class);
        $mock->shouldReceive('generate')
            ->once()
            ->with('Manager', ['leadership'])
            ->andReturn(['questions' => [['q' => 'Q1']]]);
        $this->app->instance(GenerateClosedTestService::class, $mock);

        $this->actingAs($this->makeUser('hrd'), 'sanctum')
            ->postJson('/api/ai/generate-closed-test', [
                'positionTitle' => 'Manager',
                'competencies'  => ['leadership'],
            ])
            ->assertOk()
            ->assertJsonPath('questions.0.q', 'Q1');
    }

    public function test_gateway_exception_returns_localized_error(): void
    {
        $mock = Mockery::mock(DocumentParserService::class);
        $mock->shouldReceive('parseHrDocument')
            ->andThrow(new AiGatewayException('Файл слишком большой', 413));
        $this->app->instance(DocumentParserService::class, $mock);

        $this->actingAs($this->makeUser('hrd'), 'sanctum')
            ->postJson('/api/ai/parse-hr-document', [
                'fileUrl' => 'https://example.com/x.pdf',
                'fileName' => 'x.pdf',
            ])
            ->assertStatus(413)
            ->assertJsonPath('error', 'Файл слишком большой');
    }

    public function test_assessment_chat_validates_messages(): void
    {
        $this->actingAs($this->makeUser('employee'), 'sanctum')
            ->postJson('/api/ai/assessment-chat', ['messages' => 'nope'])
            ->assertStatus(422);
    }

    public function test_assessment_chat_invokes_streaming_service(): void
    {
        $mock = Mockery::mock(AssessmentChatService::class);
        $mock->shouldReceive('stream')
            ->once()
            ->andReturn(response('data: hi'));
        $this->app->instance(AssessmentChatService::class, $mock);

        $this->actingAs($this->makeUser('employee'), 'sanctum')
            ->postJson('/api/ai/assessment-chat', [
                'messages' => [['role' => 'user', 'content' => 'привет']],
            ])
            ->assertOk()
            ->assertSee('data: hi');
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
