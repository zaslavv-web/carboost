<?php

namespace App\Policies;

use App\Models\TrackerGoal;
use App\Models\User;

/**
 * Дочерние сущности (key_results, task_goal_links, task_checkins, agenda)
 * авторизуются через родителя.
 */
class TrackerChildPolicy extends BasePolicy
{
    public function viewAny(User $user): bool { return true; }

    public function view(User $user, $model): bool
    {
        return $this->parentAllows($user, $model, 'view');
    }
    public function create(User $user): bool { return (bool) $user->companyId(); }
    public function update(User $user, $model): bool
    {
        return $this->parentAllows($user, $model, 'update');
    }
    public function delete(User $user, $model): bool
    {
        return $this->parentAllows($user, $model, 'update');
    }

    protected function parentAllows(User $user, $model, string $ability): bool
    {
        $parent = $this->resolveParent($model);
        if (! $parent) return false;
        return \Illuminate\Support\Facades\Gate::forUser($user)->allows($ability, $parent);
    }

    protected function resolveParent($model)
    {
        $table = $model->getTable();
        return match ($table) {
            'tracker_key_results' => \App\Models\TrackerGoal::withoutGlobalScopes()->find($model->goal_id),
            'tracker_task_goal_links',
            'tracker_task_checkins' => \App\Models\TrackerTask::withoutGlobalScopes()->find($model->task_id),
            'tracker_one_on_one_agenda' => \App\Models\TrackerOneOnOne::withoutGlobalScopes()->find($model->meeting_id),
            default => null,
        };
    }
}
