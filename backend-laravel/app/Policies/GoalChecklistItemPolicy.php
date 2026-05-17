<?php

namespace App\Policies;

use App\Models\CareerGoal;
use App\Models\GoalChecklistItem;
use App\Models\User;

class GoalChecklistItemPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function view(User $user, GoalChecklistItem $item): bool
    {
        $goal = $item->goal ?: CareerGoal::find($item->goal_id);
        if (!$goal) return false;

        if ($goal->user_id === $user->id) return true;
        return ($this->isHrd($user) || $this->isCompanyAdmin($user))
            && $this->sameCompany($user, $goal->company_id ?? $item->company_id ?? null);
    }

    public function create(User $user, ?GoalChecklistItem $item = null): bool
    {
        if (!$item?->goal_id) {
            return (bool) $user->companyId();
        }

        $goal = CareerGoal::find($item->goal_id);
        if (!$goal) return false;

        return $goal->user_id === $user->id
            || (($this->isHrd($user) || $this->isCompanyAdmin($user)) && $this->sameCompany($user, $goal->company_id));
    }

    public function update(User $user, GoalChecklistItem $item): bool
    {
        return $this->view($user, $item);
    }

    public function delete(User $user, GoalChecklistItem $item): bool
    {
        return $this->update($user, $item);
    }
}