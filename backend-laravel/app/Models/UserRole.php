<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Доменная роль пользователя (источник истины для верификации).
 * Spatie HasRoles использует таблицы model_has_roles/roles, но мы синхронизируем
 * public.user_roles при verify/assign через AuthUserService.
 */
class UserRole extends Model
{
    use HasUuids;

    protected $table = 'user_roles';
    public $timestamps = false;
    protected $fillable = ['user_id', 'role'];
}
