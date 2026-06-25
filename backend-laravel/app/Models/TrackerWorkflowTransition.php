<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerWorkflowTransition extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'tracker_workflow_transitions';
    protected $fillable = [
        'workflow_id', 'company_id', 'from_status_id', 'to_status_id', 'name',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->company_id) && !empty($m->workflow_id)) {
                $cid = TrackerWorkflow::query()->withoutGlobalScopes()
                    ->where('id', $m->workflow_id)->value('company_id');
                if ($cid) $m->company_id = $cid;
            }
        });
    }
}
