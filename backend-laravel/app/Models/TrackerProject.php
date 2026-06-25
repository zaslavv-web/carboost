<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerProject extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_projects';
    protected $fillable = [
        'company_id', 'key', 'name', 'description',
        'lead_id', 'color', 'icon', 'status',
    ];

    public function tasks()
    {
        return $this->hasMany(TrackerTask::class, 'project_id');
    }
}
