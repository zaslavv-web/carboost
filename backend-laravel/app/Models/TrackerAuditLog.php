<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerAuditLog extends Model
{
    use HasUuids;

    public $timestamps = false;
    protected $table = 'tracker_audit_log';
    protected $fillable = [
        'company_id', 'entity_type', 'entity_id', 'action',
        'status_from', 'status_to', 'actor_id', 'payload',
    ];
    protected $casts = ['payload' => 'array'];
}
