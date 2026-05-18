<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Contracts\Factory as SocialiteFactory;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;
use Tests\WithDomainUsers;

class GoogleAuthTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    public function test_redirect_returns_302_to_google(): void
    {
        $res = $this->get('/api/auth/google/redirect?return_to=https://app.local/auth/callback');
        $res->assertStatus(302);
        $this->assertStringContainsString('accounts.google.com', $res->headers->get('Location'));
    }

    public function test_callback_creates_user_and_redirects_with_token(): void
    {
        $google = (new SocialiteUser())->map([
            'id' => 'g-1', 'email' => 'fresh@google.io',
            'name' => 'Fresh', 'avatar' => 'http://avatar',
        ]);

        $provider = Mockery::mock();
        $provider->shouldReceive('stateless')->andReturnSelf();
        $provider->shouldReceive('user')->andReturn($google);
        $factory = Mockery::mock(SocialiteFactory::class);
        $factory->shouldReceive('driver')->with('google')->andReturn($provider);
        $this->app->instance(SocialiteFactory::class, $factory);

        $state = rtrim(strtr(base64_encode(json_encode(['return_to' => 'https://app.local/auth/callback'])), '+/', '-_'), '=');
        $res = $this->get('/api/auth/google/callback?state=' . $state);
        $res->assertStatus(302);
        $loc = $res->headers->get('Location');
        $this->assertStringStartsWith('https://app.local/auth/callback#access_token=', $loc);

        $this->assertDatabaseHas('profiles', ['full_name' => 'Fresh']);
    }

    public function test_callback_redirects_with_error_on_provider_failure(): void
    {
        $provider = Mockery::mock();
        $provider->shouldReceive('stateless')->andReturnSelf();
        $provider->shouldReceive('user')->andThrow(new \RuntimeException('bad'));
        $factory = Mockery::mock(SocialiteFactory::class);
        $factory->shouldReceive('driver')->with('google')->andReturn($provider);
        $this->app->instance(SocialiteFactory::class, $factory);

        $res = $this->get('/api/auth/google/callback');
        $res->assertStatus(302);
        $this->assertStringContainsString('#error=', $res->headers->get('Location'));
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
