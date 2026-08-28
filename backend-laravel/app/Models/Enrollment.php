<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Запись сотрудника на курс.
 *
 * Своей колонки company_id у таблицы нет — принадлежность компании определяется
 * через курс, поэтому глобальный CompanyScope здесь неприменим и скоуп задаётся
 * явно (см. ResourceRegistry).
 */
class Enrollment extends Model
{
    use HasUuids;

    protected $table = 'enrollments';

    protected $fillable = [
        'course_id', 'user_id', 'assigned_by', 'mandatory', 'due_at',
        'blocks_other', 'status', 'started_at', 'completed_at', 'certificate_id',
    ];

    protected $casts = [
        'mandatory'    => 'boolean',
        'blocks_other' => 'boolean',
        'due_at'       => 'datetime',
        'started_at'   => 'datetime',
        'completed_at' => 'datetime',
    ];
}
