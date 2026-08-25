<?php

namespace App\Policies;

use App\Models\TeamMember;
use App\Models\User;

/**
 * HR-документы: общие регламенты компании + персональные документы сотрудника
 * (owner_user_id заполнен — договор, приказ, медкнижка).
 *
 * Правила:
 *  - общие документы компании: видит любой сотрудник этой компании
 *  - персональные: видит только владелец, его руководитель роли HR/HRD/админ
 *  - создание/правка/удаление: HR/HRD/company_admin своей компании
 */
class HrDocumentPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return true; // построчная фильтрация делается в запросе (DbController)
    }

    public function view(User $user, $model): bool
    {
        if (! $this->sameCompany($user, $model->company_id ?? null)) {
            return false;
        }

        $owner = $model->owner_user_id ?? null;
        if ($owner === null || $owner === '') {
            return true; // общий регламент компании
        }

        return $this->ownsRecord($user, $model, 'owner_user_id')
            || $this->isHrd($user)
            || $this->isCompanyAdmin($user)
            || $this->isManagerOfOwner($user, $owner);
    }

    /** Руководитель видит персональные документы сотрудников своей команды. */
    protected function isManagerOfOwner(User $user, $ownerId): bool
    {
        if (! $this->isManager($user) || $ownerId === null || $ownerId === '') {
            return false;
        }

        return TeamMember::query()
            ->withoutGlobalScopes()
            ->where('manager_id', $user->id)
            ->where('employee_id', $ownerId)
            ->exists();
    }


    public function create(User $user): bool
    {
        return ($this->isHrd($user) || $this->isCompanyAdmin($user)) && (bool) $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        return ($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $model->company_id ?? null);
    }

    public function delete(User $user, $model): bool
    {
        return $this->update($user, $model);
    }
}
