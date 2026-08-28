<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Соответствие «идентификатор во внешней системе ↔ запись платформы».
 *
 * Позволяет внешней системе адресовать записи своими ключами и делает
 * повторный импорт идемпотентным.
 */
class ExternalReference extends Model
{
    use HasUuids;

    protected $table = 'external_references';

    protected $fillable = [
        'company_id', 'system', 'resource', 'external_id', 'internal_id',
    ];
}
