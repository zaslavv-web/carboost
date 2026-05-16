<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Глобальный scope: фильтрует записи по company_id текущего пользователя.
 *
 *  - Superadmin видит всё (scope не применяется).
 *  - Гость / отсутствующий company_id → пустой результат
 *    (where company_id is null AND id is null — заведомо ложное условие).
 */
class CompanyScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $user = auth()->user();
        if (!$user) {
            return; // CLI / системные операции
        }

        // Superadmin — без ограничений
        if (method_exists($user, 'hasRole') && $user->hasRole('superadmin')) {
            return;
        }

        $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;

        if (!$companyId) {
            $builder->whereRaw('1 = 0');
            return;
        }

        $builder->where($model->getTable() . '.company_id', $companyId);
    }
}
