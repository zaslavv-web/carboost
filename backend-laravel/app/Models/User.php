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
use App\Services\EmailConfigService;

/**
 * Eloquent-модель таблицы `users`.
 *
 * Колонки: id (uuid), email, password (bcrypt), email_verified_at, meta (json),
 * remember_token, created_at, updated_at.
 *
 * Доменные данные (роли, профиль, компания) хранятся в связанных таблицах:
 *   public.profiles  — full_name, avatar_url, company_id, requested_role, is_verified
 *   public.user_roles — role (employee | manager | hrd | company_admin | superadmin)
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles {
        hasRole as protected hasSpatieRole;
    }

    protected $table = 'users';

    // UUID первичный ключ
    protected $keyType    = 'string';
    public    $incrementing = false;

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
            'password'          => 'hashed',
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
            'user_id',   // FK на profiles
            'id',        // PK companies
            'id',        // PK users
            'company_id' // FK на companies в profiles
        );
    }

    /**
     * Доменная роль из public.user_roles (источник истины).
     * Spatie HasRoles используется параллельно для middleware.
     */
    public function domainRole(): ?string
    {
        if (!$this->canCompareColumnValue('user_roles', 'user_id', $this->domainUserId())) {
            return null;
        }
        return DB::table('user_roles')->where('user_id', $this->domainUserId())->value('role');
    }

    /**
     * ID, которым пользователь связан с domain-таблицами.
     * Берём из meta['sub'] если это UUID, иначе — auth идентификатор.
     */
    public function domainUserId(): string
    {
        $meta    = is_array($this->meta) ? $this->meta : [];
        $metaSub = $meta['sub'] ?? null;
        if (is_string($metaSub) && preg_match('/^[0-9a-f-]{36}$/i', $metaSub)) {
            return $metaSub;
        }
        return (string) $this->getAuthIdentifier();
    }

    /**
     * Роли проверяются сначала через public.user_roles (источник истины),
     * затем через Spatie как запасной вариант.
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

    /** Верифицирован ли пользователь суперадмином */
    public function isVerified(): bool
    {
        if (!$this->canCompareColumnValue('profiles', 'user_id', $this->domainUserId())) {
            return false;
        }
        return (bool) DB::table('profiles')->where('user_id', $this->domainUserId())->value('is_verified');
    }

    public function companyId(): ?string
    {
        if (!$this->canCompareColumnValue('profiles', 'user_id', $this->domainUserId())) {
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
            $meta      = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE ?", [$column]);
            $type      = strtolower((string) ($meta->Type ?? ''));
            $isNumeric = str_contains($type, 'int') || str_contains($type, 'decimal')
                || str_contains($type, 'float') || str_contains($type, 'double');
            return !$isNumeric || is_numeric($value);
        } catch (\Throwable) {
            return true;
        }
    }

    public function sendPasswordResetNotification($token): void
    {
        try {
            app(EmailConfigService::class)->apply();
        } catch (\RuntimeException $e) {
            if (EmailConfigService::shouldFallbackToRuntimeEnv($e)) {
                app(EmailConfigService::class)->applyRuntimeEnv();
            } else {
                throw $e;
            }
        }
        $this->notify(new ResetPasswordNotification($token));
    }
}
