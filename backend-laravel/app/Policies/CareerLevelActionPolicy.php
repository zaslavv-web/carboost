<?php

namespace App\Policies;

use App\Models\CareerLevelAction;
use App\Models\CareerTrackTemplate;
use App\Models\User;

class CareerLevelActionPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function view(User $user, CareerLevelAction $action): bool
    {
        $template = $action->template ?: CareerTrackTemplate::find($action->template_id);
        return $this->sameCompany($user, $template?->company_id);
    }

    public function create(User $user, ?CareerLevelAction $action = null): bool
    {
        if (!($this->isHrd($user) || $this->isCompanyAdmin($user))) {
            return false;
        }

        if (!$action?->template_id) {
            return (bool) $user->companyId();
        }

        $companyId = CareerTrackTemplate::query()->where('id', $action->template_id)->value('company_id');
        return $this->sameCompany($user, $companyId);
    }

    public function update(User $user, CareerLevelAction $action): bool
    {
        return ($this->isHrd($user) || $this->isCompanyAdmin($user)) && $this->view($user, $action);
    }

    public function delete(User $user, CareerLevelAction $action): bool
    {
        return $this->update($user, $action);
    }
}