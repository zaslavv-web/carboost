<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Дочерняя сущность career_track_templates — авторизация через template.company_id.
 * Свой company_id не имеет, поэтому BelongsToCompany не подключаем.
 */
class CareerLevelAction extends Model
{
    use HasUuids;

    protected $table = 'career_level_actions';
    public $timestamps = false;
    protected $fillable = ['template_id', 'action_text', 'action_order', 'is_required', 'category'];
    protected $casts = [
        'action_order' => 'integer',
        'is_required' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function template()
    {
        return $this->belongsTo(CareerTrackTemplate::class, 'template_id');
    }
}
