<?php

namespace App\Policies;

use App\Models\User;
use App\Models\UserRole;

class UserRolePolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasRole(['hrd', 'company_admin', 'superadmin']);
    }

    public function view(User $user, UserRole $role): bool
    {
        if ($role->user_id === $user->id) return true;

        $targetCompanyId = \DB::table('profiles')->where('user_id', $role->user_id)->value('company_id');
        return $user->hasRole(['hrd', 'company_admin']) && $this->sameCompany($user, $targetCompanyId);
    }

    public function create(User $user): bool
    {
        return false;
    }

    public function update(User $user, UserRole $role): bool
    {
        return false;
    }

    public function delete(User $user, UserRole $role): bool
    {
        return false;
    }
}