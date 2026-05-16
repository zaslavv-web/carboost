<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CareerTrackTemplate extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'career_track_templates';
    protected $fillable = [
        'company_id', 'created_by', 'title', 'description', 'motivation_text',
        'estimated_months', 'steps', 'is_active', 'from_position_id', 'to_position_id',
    ];
    protected $casts = [
        'steps' => 'array',
        'is_active' => 'boolean',
        'estimated_months' => 'integer',
    ];

    public function actions()
    {
        return $this->hasMany(CareerLevelAction::class, 'template_id');
    }
}
