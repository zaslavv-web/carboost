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
use App\Notifications\ResetPasswordNotification;

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
    // HasUuids убран намеренно: на легаси-схемах прод-БД users.id может быть
    // integer auto_increment. Мы никогда не создаём пользователей через
    // Eloquent (см. AuthUserService → DB::table('users')->insert(...)),
    // поэтому генерация UUID-PK здесь не нужна.
    use HasApiTokens, HasFactory, Notifiable, HasRoles {
        hasRole as protected hasSpatieRole;
    }

    protected $table = 'users';

    // keyType=string + incrementing=false безопасны и для UUID, и для int-PK:
    // findOrFail($id) корректно сравнит обе схемы (MySQL делает implicit cast).
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
        if (! $this->canCompareColumnValue('user_roles', 'user_id', $this->domainUserId())) {
            return null;
        }

        $row = DB::table('user_roles')->where('user_id', $this->domainUserId())->value('role');
        return $row;
    }

    /** ID, которым пользователь связан с legacy domain-таблицами. */
    public function domainUserId(): string
    {
        $meta = is_array($this->meta) ? $this->meta : [];
        $metaSub = $meta['sub'] ?? null;
        if (is_string($metaSub) && preg_match('/^[0-9a-f-]{36}$/i', $metaSub)) {
            return $metaSub;
        }

        return (string) $this->getAuthIdentifier();
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
            ->where('user_id', $this->domainUserId())
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
        if (! $this->canCompareColumnValue('profiles', 'user_id', $this->domainUserId())) {
            return false;
        }

        return (bool) DB::table('profiles')->where('user_id', $this->domainUserId())->value('is_verified');
    }

    public function companyId(): ?string
    {
        if (! $this->canCompareColumnValue('profiles', 'user_id', $this->domainUserId())) {
            return null;
        }

        $value = DB::table('profiles')->where('user_id', $this->domainUserId())->value('company_id');
        return $value === null ? null : (string) $value;
    }

    private function canCompareColumnValue(string $table, string $column, mixed $value): bool
    {
        if ($value === null || $value === '') return false;
        if (DB::getDriverName() !== 'mysql') return true;
        try {
            $meta = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE ?", [$column]);
            $type = strtolower((string) ($meta->Type ?? ''));
            $isNumeric = str_contains($type, 'int') || str_contains($type, 'decimal') || str_contains($type, 'float') || str_contains($type, 'double');
            return !$isNumeric || is_numeric($value);
        } catch (\Throwable) {
            return true;
        }
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }
}
