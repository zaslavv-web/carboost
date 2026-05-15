<?php

namespace App\Models\Concerns;

use App\Models\Scopes\CompanyScope;
use Illuminate\Database\Eloquent\Model;

/**
 * Трейт для моделей, у которых есть колонка company_id.
 *
 * Автоматически:
 *  1) применяет глобальный CompanyScope (фильтр по компании текущего пользователя),
 *  2) подставляет company_id текущего пользователя при создании записи.
 *
 * Superadmin не фильтруется (см. CompanyScope).
 */
trait BelongsToCompany
{
    public static function bootBelongsToCompany(): void
    {
        static::addGlobalScope(new CompanyScope());

        static::creating(function (Model $model) {
            if (empty($model->company_id) && ($user = auth()->user())) {
                $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
                if ($companyId) {
                    $model->company_id = $companyId;
                }
            }
        });
    }
}
