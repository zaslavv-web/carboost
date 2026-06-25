<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerWorkflow extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_workflows';
    protected $fillable = ['company_id', 'name', 'description', 'is_default'];
    protected $casts = ['is_default' => 'boolean'];

    public function statuses()
    {
        return $this->hasMany(TrackerWorkflowStatus::class, 'workflow_id')->orderBy('position');
    }

    public function transitions()
    {
        return $this->hasMany(TrackerWorkflowTransition::class, 'workflow_id');
    }
}
