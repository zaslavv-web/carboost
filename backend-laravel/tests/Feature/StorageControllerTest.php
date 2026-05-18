<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use Tests\WithDomainUsers;

class StorageControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('avatars');
        Storage::fake('hr-documents');
    }

    public function test_upload_requires_auth(): void
    {
        $this->postJson('/api/storage/avatars/upload')->assertStatus(401);
    }

    public function test_uploads_file_to_public_bucket_and_returns_url(): void
    {
        $this->actingAs($this->makeUser('employee'), 'sanctum');
        $res = $this->post('/api/storage/avatars/upload', [
            'file' => UploadedFile::fake()->image('me.png'),
            'path' => 'u1/me.png',
        ]);
        $res->assertOk();
        $this->assertNotNull($res->json('data.url'));
        Storage::disk('avatars')->assertExists('u1/me.png');
    }

    public function test_rejects_unknown_bucket(): void
    {
        $this->actingAs($this->makeUser('superadmin'), 'sanctum');
        $this->post('/api/storage/nope/upload', [
            'file' => UploadedFile::fake()->create('a.txt', 1),
        ])->assertStatus(404);
    }

    public function test_409_on_existing_path_without_upsert(): void
    {
        $this->actingAs($this->makeUser('employee'), 'sanctum');
        Storage::disk('avatars')->put('u1/me.png', 'x');

        $this->post('/api/storage/avatars/upload', [
            'file' => UploadedFile::fake()->image('me.png'),
            'path' => 'u1/me.png',
        ])->assertStatus(409);
    }

    public function test_destroy_deletes_paths(): void
    {
        $this->actingAs($this->makeUser('employee'), 'sanctum');
        Storage::disk('avatars')->put('a.txt', 'a');
        Storage::disk('avatars')->put('b.txt', 'b');

        $this->json('DELETE', '/api/storage/avatars', ['paths' => ['a.txt', 'b.txt']])
            ->assertOk()
            ->assertJsonPath('data.deleted', 2);

        Storage::disk('avatars')->assertMissing('a.txt');
        Storage::disk('avatars')->assertMissing('b.txt');
    }
}
