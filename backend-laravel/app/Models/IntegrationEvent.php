<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Запись журнала событий платформы.
 *
 * Первичный ключ `cursor` — автоинкремент: он же курсор пагинации pull-фида,
 * поэтому модель не использует UUID в качестве ключа.
 */
class IntegrationEvent extends Model
{
    protected $table = 'integration_events';
    protected $primaryKey = 'cursor';
    public $incrementing = true;
    protected $keyType = 'int';
    public $timestamps = false;

    protected $fillable = [
        'id', 'company_id', 'resource', 'event', 'record_id',
        'payload', 'actor_type', 'actor_id', 'occurred_at',
    ];

    protected $casts = [
        'payload'     => 'array',
        'occurred_at' => 'datetime',
    ];
}
