<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
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

        // На проде встречаются legacy-профили, где profiles.user_id не равно users.id
        // (рассинхрон uuid/integer-схем). Поэтому ищем юзера в несколько шагов:
        //   1) напрямую по users.id;
        //   2) по profiles.user_id → users.id;
        //   3) по profiles.id → profiles.user_id → users.id.
        $target = User::find($targetUserId);
        if (! $target) {
            $viaUserId = DB::table('users')
                ->whereIn('id', function ($q) use ($targetUserId) {
                    $q->select('user_id')->from('profiles')->where('id', $targetUserId);
                })
                ->orWhere('id', function ($q) use ($targetUserId) {
                    $q->select('user_id')->from('profiles')->where('user_id', $targetUserId);
                })
                ->value('id');
            if ($viaUserId) {
                $target = User::find($viaUserId);
            }
        }
        if (! $target) {
            throw new RuntimeException('Target user not found (profile/user link is broken).');
        }

        $abilities = [
            self::ABILITY_PREFIX_AS . $target->id,
            self::ABILITY_PREFIX_BY . $actor->id,
        ];

        // Токен выпускается на actor, чтобы revoke легко найти по user_id актора.
        $token = $actor->createToken(self::TOKEN_NAME, $abilities, now()->addMinutes($ttlMinutes));

        DB::table('impersonation_audit')->insert([
            'id'              => (string) \Illuminate\Support\Str::uuid(),
            'actor_user_id'   => $actor->id,
            'target_user_id'  => $target->id,
            'token_id'        => $token->accessToken->id,
            'started_at'      => now(),
        ]);

        return [
            'token'        => $token->plainTextToken,
            'expires_at'   => $token->accessToken->expires_at,
            'target_user'  => ['id' => $target->id, 'email' => $target->email],
        ];
    }

    public function stop(User $actor): void
    {
        $actor->tokens()->where('name', self::TOKEN_NAME)->delete();
        DB::table('impersonation_audit')
            ->where('actor_user_id', $actor->id)
            ->whereNull('ended_at')
            ->update(['ended_at' => now()]);
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
