<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Создаёт/обновляет пользователей напрямую в таблице `users` (MySQL/Laravel-схема).
 *
 * Все операции идут в таблицу `users` напрямую через DB::table('users').
 * Никакой Supabase-схемы auth.users здесь нет.
 */
class AuthUserService
{
    /**
     * Создаёт нового пользователя с email + bcrypt-паролем.
     * Возвращает Eloquent-модель User.
     *
     * Автоматически определяет тип колонки id: если INT — не передаём UUID,
     * пусть MySQL сам выдаст auto_increment значение.
     */
    public function createWithPassword(
        string $email,
        string $password,
        string $fullName,
        string $requestedRole = 'employee',
        ?string $companyId = null,
        bool $isVerified = false,
    ): User {
        $hash = Hash::make($password);

        $row = [
            'email'             => strtolower($email),
            'password'          => $hash,
            'email_verified_at' => $isVerified ? now() : null,
            'meta'              => json_encode([
                'full_name'      => $fullName,
                'requested_role' => $requestedRole,
            ], JSON_UNESCAPED_UNICODE),
            'created_at'        => now(),
            'updated_at'        => now(),
        ];

        // Передаём UUID только если колонка id — строковая (char/varchar).
        // Если int/bigint — пропускаем, MySQL выдаст auto_increment.
        if (!$this->tableIdIsInteger('users')) {
            $row['id'] = (string) Str::uuid();
        }

        $this->fillMissingDefaults('users', $row);

        DB::table('users')->insert($row);

        $user = User::where('email', strtolower($email))->firstOrFail();

        $this->ensureDomainRows($user, [
            'name'   => $fullName,
            'email'  => strtolower($email),
            'avatar' => null,
        ], true, $requestedRole, $companyId, $isVerified);

        return $user;
    }

    /**
     * Создаёт пользователя через Google SSO (без пароля).
     * Если пользователь с таким email уже есть — линкует google_id и возвращает его.
     */
    public function findOrCreateFromGoogle(array $googleUser): User
    {
        $email = strtolower($googleUser['email']);

        $existing = User::where('email', $email)->first();
        if ($existing) {
            $meta = array_merge($existing->meta ?? [], [
                'google_id'  => $googleUser['id'],
                'avatar_url' => $googleUser['avatar'] ?? null,
                'provider'   => 'google',
            ]);
            $existing->forceFill([
                'email_verified_at' => $existing->email_verified_at ?? now(),
                'meta'              => $meta,
            ])->save();

            $existingRole      = $this->normalizeRole($existing->domainRole() ?? ($existing->meta['requested_role'] ?? null));
            $existingCompanyId = $this->stringOrNull($existing->companyId() ?? ($existing->meta['company_id'] ?? null));
            $this->ensureDomainRows(
                $existing,
                $googleUser,
                false,
                $existingRole,
                $existingCompanyId,
                $existing->isVerified() || (bool) $existing->email_verified_at
            );
            return $existing->refresh();
        }

        $row = [
            'email'             => $email,
            'password'          => Hash::make(Str::random(64)),
            'email_verified_at' => now(),
            'meta'              => json_encode([
                'full_name'      => $googleUser['name']   ?? $email,
                'avatar_url'     => $googleUser['avatar'] ?? null,
                'google_id'      => $googleUser['id'],
                'requested_role' => 'employee',
                'provider'       => 'google',
            ], JSON_UNESCAPED_UNICODE),
            'created_at'        => now(),
            'updated_at'        => now(),
        ];

        if (!$this->tableIdIsInteger('users')) {
            $row['id'] = (string) Str::uuid();
        }

        $this->fillMissingDefaults('users', $row);

        DB::table('users')->insert($row);

        $user = User::where('email', $email)->firstOrFail();
        $this->ensureDomainRows($user, $googleUser, true);
        return $user->refresh();
    }

    /**
     * Лечит доменные строки старых аккаунтов при обычном логине.
     */
    public function repairDomainRowsForLogin(User $user): void
    {
        $meta = is_array($user->meta) ? $user->meta : [];
        $role = $this->normalizeRole($user->domainRole() ?? ($meta['requested_role'] ?? null));
        $this->ensureDomainRows($user, [
            'name'   => $meta['full_name'] ?? $meta['name'] ?? $user->email,
            'email'  => $user->email,
            'avatar' => $meta['avatar_url'] ?? $meta['picture'] ?? null,
        ], false, $role, $this->stringOrNull($meta['company_id'] ?? null), $user->isVerified() || (bool) $user->email_verified_at);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    private function normalizeRole(?string $role): string
    {
        return in_array($role, ['employee', 'manager', 'hrd', 'company_admin', 'superadmin'], true)
            ? $role
            : 'employee';
    }

    private function stringOrNull(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        return (string) $value;
    }

    private function domainUserId(User $user): string
    {
        return method_exists($user, 'domainUserId')
            ? (string) $user->domainUserId()
            : (string) $user->getAuthIdentifier();
    }

    /**
     * Возвращает true если колонка id в таблице — числовой тип (int/bigint).
     * В таком случае UUID передавать нельзя — MySQL обрежет до 0.
     */
    private function tableIdIsInteger(string $table): bool
    {
        if (DB::getDriverName() !== 'mysql') {
            return false;
        }
        try {
            $column = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE 'id'");
            return $column && str_contains(strtolower((string) $column->Type), 'int');
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Для MySQL: заполняем NOT NULL колонки без DEFAULT безопасными значениями,
     * чтобы INSERT не падал на старых схемах.
     */
    private function fillMissingDefaults(string $table, array &$row): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        try {
            $columns = DB::select("SHOW COLUMNS FROM `{$table}`");
        } catch (\Throwable) {
            return;
        }
        foreach ($columns as $col) {
            $name = $col->Field;
            if (array_key_exists($name, $row)) {
                continue;
            }
            if (strtoupper((string) $col->Null) === 'YES') {
                continue;
            }
            if ($col->Default !== null) {
                continue;
            }
            if (str_contains(strtolower((string) $col->Extra), 'auto_increment')
                || str_contains(strtolower((string) $col->Extra), 'generated')) {
                continue;
            }
            $type       = strtolower((string) $col->Type);
            $row[$name] = match (true) {
                str_contains($type, 'int'),
                str_contains($type, 'decimal'),
                str_contains($type, 'float'),
                str_contains($type, 'double') => 0,
                str_contains($type, 'bool'),
                str_contains($type, 'tinyint(1)') => false,
                str_contains($type, 'json') => '{}',
                str_contains($type, 'date'),
                str_contains($type, 'time') => now(),
                default => '',
            };
        }
    }

    /**
     * Проверяет совместимость значения с типом колонки (UUID vs numeric).
     */
    private function canWriteColumnValue(string $table, string $column, mixed $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }
        if (DB::getDriverName() !== 'mysql') {
            return true;
        }
        try {
            $meta = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE ?", [$column]);
        } catch (\Throwable) {
            return true;
        }
        $type      = strtolower((string) ($meta->Type ?? ''));
        $isNumeric = str_contains($type, 'int')
            || str_contains($type, 'decimal')
            || str_contains($type, 'float')
            || str_contains($type, 'double');

        return !$isNumeric || is_numeric($value);
    }

    /**
     * Создаёт/обновляет связанные строки в profiles и user_roles.
     */
    private function ensureDomainRows(
        User $user,
        array $googleUser,
        bool $isNewUser,
        string $role = 'employee',
        ?string $companyId = null,
        bool $isVerified = false
    ): void {
        $userId = $this->domainUserId($user);
        $role   = $this->normalizeRole($role);

        // ── profiles ──────────────────────────────────────────────────────────
        $profile = DB::table('profiles')->where('user_id', $userId)->first();
        if ($profile) {
            $updates = [
                'full_name'      => $profile->full_name ?: ($googleUser['name'] ?? $user->email),
                'avatar_url'     => $googleUser['avatar'] ?? $profile->avatar_url,
                'requested_role' => $profile->requested_role ?: ($role ?: 'employee'),
                'is_verified'    => $isVerified || (bool) $profile->is_verified,
                'updated_at'     => now(),
            ];
            if (!$profile->company_id && $this->canWriteColumnValue('profiles', 'company_id', $companyId)) {
                $updates['company_id'] = $companyId;
            }
            DB::table('profiles')->where('user_id', $userId)->update($updates);
        } else {
            $profileRow = [
                'user_id'        => $userId,
                'full_name'      => $googleUser['name'] ?? $user->email,
                'avatar_url'     => $googleUser['avatar'] ?? null,
                'requested_role' => $role,
                'is_verified'    => $isVerified,
                'created_at'     => now(),
                'updated_at'     => now(),
            ];
            if ($this->canWriteColumnValue('profiles', 'company_id', $companyId)) {
                $profileRow['company_id'] = $companyId;
            }
            if (!$this->tableIdIsInteger('profiles')) {
                $profileRow['id'] = (string) Str::uuid();
            }
            $this->fillMissingDefaults('profiles', $profileRow);
            DB::table('profiles')->insert($profileRow);
        }

        // ── user_roles ────────────────────────────────────────────────────────
        if ($isNewUser || !DB::table('user_roles')->where('user_id', $userId)->exists()) {
            $roleValues = [];
            if (!$this->tableIdIsInteger('user_roles')) {
                $existing       = DB::table('user_roles')
                    ->where('user_id', $userId)
                    ->where('role', $role)
                    ->value('id');
                $roleValues['id'] = $existing ?: (string) Str::uuid();
            }
            DB::table('user_roles')->updateOrInsert(
                ['user_id' => $userId, 'role' => $role],
                $roleValues
            );
        }
    }
}
