<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Сервис superadmin-импersonation поверх Sanctum.
 *
 * Идея: суперадмин выпускает себе ВТОРОЙ токен с доменом target-пользователя,
 * сохраняя в abilities исходный actor_id. На бэке middleware EffectiveUser
 * подменяет auth()->user() на target, не теряя «настоящего» актора (для аудита).
 *
 * Преимущество перед клиентским sessionStorage (как в ImpersonationContext):
 *   - target_user_id зашит в подписанный токен → подделать нельзя;
 *   - токен ограничен ttl;
 *   - аудит-лог пишет реального инициатора.
 */
class ImpersonationService
{
    private const TOKEN_NAME = 'impersonation';
    private const ABILITY_PREFIX_AS = 'impersonate-as:';
    private const ABILITY_PREFIX_BY = 'impersonated-by:';

    public function start(User $actor, string $targetUserId, int $ttlMinutes = 60): array
    {
        if (! $actor->hasRole('superadmin')) {
            throw new RuntimeException('Only superadmin can impersonate.');
        }

        $target = $this->resolveTargetUser($targetUserId);
        if (! $target) {
            throw new RuntimeException('Target user not found (profile/user link is broken).');
        }

        $abilities = [
            self::ABILITY_PREFIX_AS . $target->id,
            self::ABILITY_PREFIX_BY . $actor->id,
        ];

        // Токен выпускается на actor, чтобы revoke легко найти по user_id актора.
        // Используем ручную запись в Sanctum-таблицу: на проде встречаются разные
        // версии/схемы Sanctum, и createToken() уже приводил к 500 на impersonation.
        $token = $this->createImpersonationToken($actor, $abilities, $ttlMinutes);

        $this->writeAuditStart($actor, $target, $token['id']);

        return [
            'token'        => $token['plain_text_token'],
            'expires_at'   => $token['expires_at'],
            'target_user'  => ['id' => $target->id, 'email' => $target->email],
        ];
    }

    private function createImpersonationToken(User $actor, array $abilities, int $ttlMinutes): array
    {
        if (! Schema::hasTable('personal_access_tokens')) {
            throw new RuntimeException('Таблица токенов не найдена. Примените миграции backend.');
        }

        $plain = Str::random(40);
        $expiresAt = now()->addMinutes($ttlMinutes);
        $row = [
            'tokenable_type' => $actor->getMorphClass(),
            'tokenable_id'   => (string) $actor->getAuthIdentifier(),
            'name'           => self::TOKEN_NAME,
            'token'          => hash('sha256', $plain),
            'abilities'      => json_encode($abilities, JSON_UNESCAPED_UNICODE),
            'expires_at'     => $expiresAt,
        ];

        if (Schema::hasColumn('personal_access_tokens', 'created_at')) $row['created_at'] = now();
        if (Schema::hasColumn('personal_access_tokens', 'updated_at')) $row['updated_at'] = now();

        $id = DB::table('personal_access_tokens')->insertGetId($row);

        return [
            'id' => $id,
            'plain_text_token' => $id . '|' . $plain,
            'expires_at' => $expiresAt,
        ];
    }

    private function resolveTargetUser(string $targetUserId): ?User
    {
        $target = User::query()->whereKey($targetUserId)->first();
        if ($target) {
            return $target;
        }

        $profile = DB::table('profiles')
            ->where('id', $targetUserId)
            ->orWhere('user_id', $targetUserId)
            ->first();

        if (! $profile) {
            return null;
        }

        $candidateIds = array_values(array_filter([
            $profile->user_id ?? null,
            $profile->id ?? null,
        ], fn ($id) => $id !== null && $id !== ''));

        if ($candidateIds) {
            $target = User::query()->whereIn('id', $candidateIds)->first();
            if ($target) {
                return $target;
            }
        }

        $email = $profile->email ?? null;
        if ($email && Schema::hasColumn('users', 'email')) {
            return User::query()->where('email', $email)->first();
        }

        return null;
    }

    private function writeAuditStart(User $actor, User $target, $tokenId): void
    {
        if (! Schema::hasTable('impersonation_audit')) {
            return;
        }

        try {
            DB::table('impersonation_audit')->insert([
                'id'              => (string) Str::uuid(),
                'actor_user_id'   => (string) $actor->id,
                'target_user_id'  => (string) $target->id,
                'token_id'        => $tokenId,
                'started_at'      => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Impersonation audit write failed', [
                'actor_user_id' => (string) $actor->id,
                'target_user_id' => (string) $target->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function stop(User $actor): void
    {
        $actor->tokens()->where('name', self::TOKEN_NAME)->delete();
        if (! Schema::hasTable('impersonation_audit')) {
            return;
        }

        try {
            DB::table('impersonation_audit')
                ->where('actor_user_id', (string) $actor->id)
                ->whereNull('ended_at')
                ->update(['ended_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning('Impersonation audit stop failed', [
                'actor_user_id' => (string) $actor->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Извлекает target_user_id из abilities текущего токена, либо null
     * если это обычный (не impersonation) токен.
     */
    public static function targetFromToken($token): ?string
    {
        if (! $token) return null;
        foreach ((array) $token->abilities as $ability) {
            if (str_starts_with($ability, self::ABILITY_PREFIX_AS)) {
                return substr($ability, strlen(self::ABILITY_PREFIX_AS));
            }
        }
        return null;
    }

    public static function actorFromToken($token): ?string
    {
        if (! $token) return null;
        foreach ((array) $token->abilities as $ability) {
            if (str_starts_with($ability, self::ABILITY_PREFIX_BY)) {
                return substr($ability, strlen(self::ABILITY_PREFIX_BY));
            }
        }
        return null;
    }
}
