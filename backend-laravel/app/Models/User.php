<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

/**
 * Eloquent-модель поверх VIEW public.users (см. миграцию 0001_..._laravel_compat_on_auth_users).
 *
 * VIEW проксирует auth.users c маппингом:
 *   id                  → id (uuid)
 *   email               → email
 *   encrypted_password  → password (bcrypt от Supabase, Laravel читает нативно)
 *   email_confirmed_at  → email_verified_at
 *   raw_user_meta_data  → meta (jsonb)
 *
 * INSERT/DELETE на view не работают по умолчанию — для регистрации/удаления
 * используйте App\Services\AuthUserService (создаёт строку напрямую в auth.users).
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasUuids, HasRoles {
        hasRole as protected hasSpatieRole;
    }

    protected $table = 'users';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'email',
        'password',
        'email_verified_at',
        'meta',
        'remember_token',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed', // Laravel bcrypt совместим с Supabase
            'meta'              => 'array',
        ];
    }

    /** Профиль из public.profiles (1-1 по user_id) */
    public function profile()
    {
        return $this->hasOne(Profile::class, 'user_id', 'id');
    }

    /** Компания через профиль */
    public function company()
    {
        return $this->hasOneThrough(
            Company::class,
            Profile::class,
            'user_id',     // FK на profiles
            'id',          // PK companies
            'id',          // PK users
            'company_id'   // FK на companies в profiles
        );
    }

    /**
     * Доменная роль из public.user_roles (источник истины).
     * Spatie HasRoles используется параллельно для middleware.
     */
    public function domainRole(): ?string
    {
        $row = DB::table('user_roles')->where('user_id', $this->id)->value('role');
        return $row;
    }

    /**
     * Роли в проекте хранятся в public.user_roles — это источник истины.
     * Spatie-таблицы могут быть не синхронизированы после импорта/миграций,
     * поэтому все policy/gate проверки должны сначала смотреть user_roles.
     */
    public function hasRole($roles, ?string $guard = null): bool
    {
        $expectedRoles = collect(is_array($roles) ? $roles : [$roles])
            ->map(function ($role) {
                if ($role instanceof \BackedEnum) {
                    return (string) $role->value;
                }
                if (is_object($role) && isset($role->name)) {
                    return (string) $role->name;
                }
                return (string) $role;
            })
            ->filter()
            ->values();

        if ($expectedRoles->isEmpty()) {
            return false;
        }

        $domainRoles = DB::table('user_roles')
            ->where('user_id', $this->id)
            ->pluck('role')
            ->map(fn ($role) => (string) $role);

        if ($domainRoles->intersect($expectedRoles)->isNotEmpty()) {
            return true;
        }

        return $this->hasSpatieRole($roles, $guard);
    }

    /** Удобный геттер: верифицирован ли пользователь суперадмином */
    public function isVerified(): bool
    {
        return (bool) DB::table('profiles')->where('user_id', $this->id)->value('is_verified');
    }

    public function companyId(): ?string
    {
        return DB::table('profiles')->where('user_id', $this->id)->value('company_id');
    }
}
