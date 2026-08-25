<?php

namespace App\Policies;

use App\Models\Profile;
use App\Models\User;

class ProfilePolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        // Профили используются как справочник сотрудников: аватары/ФИО в чатах,
        // упоминаниях, назначениях и карточках. Доступ к чужим компаниям режется
        // company-scope в контроллере, поэтому сам список доступен всем
        // авторизованным пользователям компании.
        return true;
    }

    public function view(User $user, Profile $profile): bool
    {
        if ($profile->user_id === $user->id) return true;
        return $this->sameCompany($user, $profile->company_id);
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
