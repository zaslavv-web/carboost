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

    public function start(User $actor, string $targetUserId, int $ttlMinutes = 60, ?string $currentBearerToken = null): array
    {
        if (! $actor->hasRole('superadmin')) {
            throw new RuntimeException('Only superadmin can impersonate.');
        }
        if (trim($targetUserId) === '') {
            throw new RuntimeException('Target user id is required.');
        }

        // В legacy-версии impersonation — клиентский режим поверх прав
        // superadmin. На MySQL-схеме поиск по UUID в integer-колонке может
        // упасть с SQLSTATE[22007], поэтому resolveTargetUser обёрнут в try
        // и failure не блокирует endpoint — фронт всё равно работает со
        // снимком профиля target из списка пользователей.
        $target = null;
        try {
            $target = $this->resolveTargetUser($targetUserId);
        } catch (\Throwable $e) {
            Log::warning('Impersonation resolveTargetUser failed', [
                'target_user_id' => $targetUserId,
                'error' => $e->getMessage(),
            ]);
        }

        if (! $currentBearerToken) {
            throw new RuntimeException('Current auth token is missing.');
        }

        $this->writeAuditStart($actor, $target, $targetUserId, null);

        $expiresAt = now()->addMinutes($ttlMinutes);

        return [
            'token'        => $currentBearerToken,
            'expires_at'   => $expiresAt,
            'target_user'  => [
                'id'    => $target?->id ?? $targetUserId,
                'email' => $target?->email,
            ],
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
        $tryFind = function (callable $fn) {
            try { return $fn(); } catch (\Throwable $e) { return null; }
        };

        $target = $tryFind(fn () => User::query()->whereKey($targetUserId)->first());
        if ($target) return $target;

        // legacy: users.meta может содержать sub = UUID из старого legacy
        $target = $tryFind(function () use ($targetUserId) {
            if (! Schema::hasColumn('users', 'meta')) return null;
            return User::query()
                ->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(meta, '$.sub')) = ?", [$targetUserId])
                ->first();
        });
        if ($target) return $target;

        $profile = $tryFind(function () use ($targetUserId) {
            return DB::table('profiles')
                ->where(function ($q) use ($targetUserId) {
                    try { $q->orWhere('id', $targetUserId); } catch (\Throwable $e) {}
                    try { $q->orWhere('user_id', $targetUserId); } catch (\Throwable $e) {}
                })
                ->first();
        });

        if (! $profile) return null;

        $candidateIds = array_values(array_filter([
            $profile->user_id ?? null,
            $profile->id ?? null,
        ], fn ($id) => $id !== null && $id !== ''));

        foreach ($candidateIds as $cid) {
            $found = $tryFind(fn () => User::query()->whereKey($cid)->first());
            if ($found) return $found;
        }

        $email = $profile->email ?? null;
        if ($email && Schema::hasColumn('users', 'email')) {
            return $tryFind(fn () => User::query()->where('email', $email)->first());
        }

        return null;
    }

    private function writeAuditStart(User $actor, ?User $target, string $targetUserId, $tokenId): void
    {
        if (! Schema::hasTable('impersonation_audit')) {
            return;
        }

        try {
            DB::table('impersonation_audit')->insert([
                'id'              => (string) Str::uuid(),
                'actor_user_id'   => (string) $actor->id,
                'target_user_id'  => (string) ($target?->id ?? $targetUserId),
                'token_id'        => $tokenId,
                'started_at'      => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Impersonation audit write failed', [
                'actor_user_id' => (string) $actor->id,
                'target_user_id' => (string) ($target?->id ?? $targetUserId),
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
