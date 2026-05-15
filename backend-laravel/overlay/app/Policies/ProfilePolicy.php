<?php

namespace App\Policies;

use App\Models\Profile;
use App\Models\User;

class ProfilePolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return $this->isHrd($user) || $this->isCompanyAdmin($user);
    }

    public function view(User $user, Profile $profile): bool
    {
        if ($profile->user_id === $user->id) return true;
        if (($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $profile->company_id)) return true;
        return false;
    }

    public function update(User $user, Profile $profile): bool
    {
        if ($profile->user_id === $user->id) return true;
        if ($this->isCompanyAdmin($user) && $this->sameCompany($user, $profile->company_id)) return true;
        return false;
    }

    public function verify(User $user, Profile $profile): bool
    {
        return $this->isCompanyAdmin($user) && $this->sameCompany($user, $profile->company_id);
    }
}
