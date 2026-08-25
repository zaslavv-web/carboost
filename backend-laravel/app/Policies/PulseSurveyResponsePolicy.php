<?php

namespace App\Policies;

use App\Models\User;

/**
 * Ответы на pulse-опросы заполняют сами сотрудники, поэтому создание
 * доступно любому пользователю компании. Правка/удаление — только своих
 * ответов (или HRD/админу компании).
 */
class PulseSurveyResponsePolicy extends CompanyScopedPolicy
{
    public function create(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        if (($model->user_id ?? null) === $user->id) {
            return $this->sameCompany($user, $model->company_id ?? null);
        }

        return parent::update($user, $model);
    }
}
