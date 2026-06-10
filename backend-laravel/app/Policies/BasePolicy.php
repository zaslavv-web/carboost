<?php

namespace App\Policies;

use App\Models\User;

/**
 * Базовый класс политик.
 *
 * Зеркалит RLS-логику legacy:
 *   - superadmin: всё
 *   - company_admin / hrd: всё в рамках своей компании
 *   - manager: своя команда (определяется в наследниках)
 *   - employee: только своё (user_id == auth.uid())
 */
abstract class BasePolicy
{
    /** Глобальный bypass: суперадмин всегда true. */
    public function before(User $user, string $ability): ?bool
    {
        if ($user->hasRole('superadmin')) {
            return true;
        }
        $impersonator = method_exists($user, 'getAttribute') ? $user->getAttribute('impersonator') : null;
        if ($impersonator && method_exists($impersonator, 'hasRole') && $impersonator->hasRole('superadmin')) {
            return true;
        }
        return null;
    }

    protected function sameCompany(User $user, ?string $companyId): bool
    {
        if (!$companyId) return false;
        return $user->companyId() === $companyId;
    }

    protected function isCompanyAdmin(User $user): bool
    {
        return $user->hasRole('company_admin');
    }

    protected function isHrd(User $user): bool
    {
        return $user->hasRole('hrd');
    }

    protected function isManager(User $user): bool
    {
        return $user->hasRole('manager');
    }

    protected function ownsRecord(User $user, $model, string $column = 'user_id'): bool
    {
        return isset($model->{$column}) && $model->{$column} === $user->id;
    }
}
