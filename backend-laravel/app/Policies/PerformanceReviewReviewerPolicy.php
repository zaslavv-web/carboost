<?php

namespace App\Policies;

use App\Models\PerformanceReview;
use App\Models\User;

/**
 * Приглашения ревьюеров 360°.
 *
 * Создавать/удалять приглашения может:
 *  - HR/HRD/company_admin своей компании,
 *  - оцениваемый сотрудник (сам инициирует своё 360),
 *  - руководитель оцениваемого сотрудника.
 *
 * Видеть список приглашений может любой, у кого есть доступ к самому review
 * (см. PerformanceController@assertCanViewReview) — здесь дублируем то же
 * правило, плюс сам приглашённый ревьюер должен видеть свои приглашения.
 */
class PerformanceReviewReviewerPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, $model): bool
    {
        if (! $this->sameCompany($user, $model->company_id ?? null)) {
            return false;
        }
        if ($this->ownsRecord($user, $model, 'reviewer_id')) {
            return true;
        }
        return $this->canManageReview($user, $model);
    }

    public function create(User $user): bool
    {
        return (bool) $user->companyId();
    }

    public function update(User $user, $model): bool
    {
        if ($this->ownsRecord($user, $model, 'reviewer_id')) {
            return true; // ревьюер может отметить submitted/declined
        }
        return $this->canManageReview($user, $model);
    }

    public function delete(User $user, $model): bool
    {
        return $this->canManageReview($user, $model);
    }

    /** HR/HRD/admin компании, либо сам оцениваемый, либо его руководитель. */
    protected function canManageReview(User $user, $model): bool
    {
        if (! $this->sameCompany($user, $model->company_id ?? null)) {
            return false;
        }
        if ($this->isHrd($user) || $this->isCompanyAdmin($user)) {
            return true;
        }

        $reviewId = is_object($model) ? ($model->review_id ?? null) : null;
        if (! $reviewId) {
            return false;
        }
        $review = PerformanceReview::query()->find($reviewId);
        if (! $review) {
            return false;
        }
        if ((string) $review->user_id === (string) $user->id) {
            return true; // сам оцениваемый приглашает ревьюеров
        }
        if ($review->manager_id && (string) $review->manager_id === (string) $user->id) {
            return true; // руководитель оцениваемого
        }

        return false;
    }
}
