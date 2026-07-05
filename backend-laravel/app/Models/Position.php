<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Position extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'positions';
    /**
     * FIX (HRD sim 2026-07-05): fillable ссылался на legacy-поля
     * (department_id, level, parent_position_id), которых нет в реальной схеме.
     * Приведено к колонкам миграции 0002_00_35.
     */
    protected $fillable = [
        'company_id', 'created_by', 'title', 'description', 'department',
        'psychological_profile', 'competency_profile',
        'profile_status', 'profile_version', 'profile_template',
        'approved_by', 'approved_at',
    ];

    protected $casts = [
        'psychological_profile' => 'array',
        'competency_profile'    => 'array',
        'profile_template'      => 'array',
        'profile_version'       => 'integer',
        'approved_at'           => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            // created_by NOT NULL в схеме — авто-заполняем из auth-контекста.
            if (empty($m->created_by) && ($u = auth()->user())) {
                $m->created_by = $u->id;
            }
        });
    }
}
