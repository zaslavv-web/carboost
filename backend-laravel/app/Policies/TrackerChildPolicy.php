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
        // Комментарии и вложения может править/удалять только автор
        // (либо HR/админ компании через TrackerOwnedPolicy на родителе).
        if ($this->isOwnedChild($model)) {
            return $this->isOwner($user, $model) || $this->isCompanyAdmin($user, $model);
        }
        return $this->parentAllows($user, $model, 'update');
    }
    public function delete(User $user, $model): bool
    {
        if ($this->isOwnedChild($model)) {
            return $this->isOwner($user, $model) || $this->isCompanyAdmin($user, $model);
        }
        return $this->parentAllows($user, $model, 'update');
    }

    protected function isOwnedChild($model): bool
    {
        return in_array($model->getTable(), ['tracker_comments', 'tracker_attachments'], true);
    }

    protected function isOwner(User $user, $model): bool
    {
        $ownerField = $model->getTable() === 'tracker_comments' ? 'author_id' : 'uploader_id';
        return (string) $model->{$ownerField} === (string) $user->id;
    }

    protected function isCompanyAdmin(User $user, $model): bool
    {
        if ((string) ($model->company_id ?? '') !== (string) ($user->companyId() ?? '')) return false;
        return $user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin');
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
            'tracker_task_checkins',
            'tracker_comments',
            'tracker_attachments' => \App\Models\TrackerTask::withoutGlobalScopes()->find($model->task_id),
            'tracker_one_on_one_agenda' => \App\Models\TrackerOneOnOne::withoutGlobalScopes()->find($model->meeting_id),
            default => null,
        };
    }
}
