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

    // ──────────────────────────────────────────────────────────────────────
    // Мемоизация доменных прав.
    //
    // CompanyScope и политики вызывают hasRole()/companyId()/isVerified()
    // десятки раз за один HTTP-запрос. Раньше каждый вызов делал отдельный
    // SELECT (+ SHOW COLUMNS), что на шаред-хостинге с лимитом
    // max_user_connections превращалось в таймауты у всех, кроме superadmin
    // (у него scope выходит на первой проверке). Теперь роли и строка профиля
    // читаются один раз за запрос, а метаданные колонок — один раз за процесс.
    // ──────────────────────────────────────────────────────────────────────

    /** @var array<string,bool> кэш «колонка числовая?» на время процесса */
    private static array $columnNumericCache = [];

    /** @var array<string>|null роли из user_roles, прочитанные один раз */
    private ?array $memoDomainRoles = null;

    /** @var object|false|null строка profiles: null = не читали, false = нет строки */
    private object|false|null $memoProfileRow = null;

    /** Сбрасывает мемоизацию (после self-heal, смены ролей и т.п.). */
    public function forgetDomainMemo(): void
    {
        $this->memoDomainRoles = null;
        $this->memoProfileRow  = null;
    }

    /** Роли из public.user_roles — один SELECT за запрос. */
    public function domainRoles(): array
    {
        if ($this->memoDomainRoles !== null) {
            return $this->memoDomainRoles;
        }
        if (!$this->canCompareColumnValue('user_roles', 'user_id', $this->domainUserId())) {
            return $this->memoDomainRoles = [];
        }
        try {
            $this->memoDomainRoles = DB::table('user_roles')
                ->where('user_id', $this->domainUserId())
                ->pluck('role')
                ->map(fn ($role) => (string) $role)
                ->all();
        } catch (\Throwable) {
            $this->memoDomainRoles = [];
        }
        return $this->memoDomainRoles;
    }

    /** Строка profiles текущего пользователя — один SELECT за запрос. */
    private function profileRow(): ?object
    {
        if ($this->memoProfileRow !== null) {
            return $this->memoProfileRow === false ? null : $this->memoProfileRow;
        }
        if (!$this->canCompareColumnValue('profiles', 'user_id', $this->domainUserId())) {
            $this->memoProfileRow = false;
            return null;
        }
        try {
            $row = DB::table('profiles')->where('user_id', $this->domainUserId())->first();
        } catch (\Throwable) {
            $row = null;
        }
        $this->memoProfileRow = $row ?: false;
        return $row ?: null;
    }

    /**
     * Доменная роль из public.user_roles (источник истины).
     * Spatie HasRoles используется параллельно для middleware.
     */
    public function domainRole(): ?string
    {
        return $this->domainRoles()[0] ?? null;
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

        // HR имеет тот же уровень доступа, что и HRD (подчинение только
        // организационное). Поэтому любой запрос на роль 'hrd' удовлетворяется
        // и наличием роли 'hr' — и наоборот, чтобы политики, написанные под
        // одну из формулировок, работали для обеих ролей.
        $expanded = $expectedRoles->flatMap(function ($role) {
            if ($role === 'hrd') return ['hrd', 'hr'];
            if ($role === 'hr')  return ['hr', 'hrd'];
            return [$role];
        })->unique()->values();

        if (array_intersect($this->domainRoles(), $expanded->all())) {
            return true;
        }

        return $this->hasSpatieRole($expanded->all(), $guard);
    }

    /** Верифицирован ли пользователь суперадмином */
    public function isVerified(): bool
    {
        return (bool) ($this->profileRow()->is_verified ?? false);
    }

    public function companyId(): ?string
    {
        $value = $this->profileRow()->company_id ?? null;
        return ($value === null || $value === '') ? null : (string) $value;
    }

    private function canCompareColumnValue(string $table, string $column, mixed $value): bool
    {
        if ($value === null || $value === '') return false;
        if (DB::getDriverName() !== 'mysql') return true;

        $cacheKey = $table . '.' . $column;
        if (!array_key_exists($cacheKey, self::$columnNumericCache)) {
            try {
                $meta = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE ?", [$column]);
                $type = strtolower((string) ($meta->Type ?? ''));
                self::$columnNumericCache[$cacheKey] = str_contains($type, 'int')
                    || str_contains($type, 'decimal')
                    || str_contains($type, 'float')
                    || str_contains($type, 'double');
            } catch (\Throwable) {
                return true;
            }
        }

        return !self::$columnNumericCache[$cacheKey] || is_numeric($value);
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
