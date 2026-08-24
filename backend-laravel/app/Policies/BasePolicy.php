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
        // HR и HRD имеют одинаковые права управления HR-модулями внутри
        // своей компании; tenant-проверка остаётся в конкретной политике.
        return $user->hasRole(['hrd', 'hr']);
    }

    protected function isManager(User $user): bool
    {
        return $user->hasRole('manager');
    }

    protected function ownsRecord(User $user, $model, string $column = 'user_id'): bool
    {
        $value = is_object($model) ? ($model->{$column} ?? null) : null;
        if ($value === null || $value === '') return false;
        // ID пользователя может приходить как int (users.id) и как string (колонки uuid/varchar) —
        // сравниваем как строки, иначе строгое === даёт ложные 403.
        return (string) $value === (string) $user->id;
    }

}
