<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class WebhookSubscription extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'webhook_subscriptions';
    protected $fillable = [
        'company_id', 'created_by', 'name', 'url', 'events', 'secret',
        'is_active', 'last_delivery_at', 'last_delivery_status',
    ];
    protected $casts = [
        'events'           => 'array',
        'is_active'        => 'boolean',
        'last_delivery_at' => 'datetime',
    ];
    protected $hidden = ['secret'];
}
