<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class WebhookDelivery extends Model
{
    use HasUuids, BelongsToCompany;

    public $timestamps = false;

    protected $table = 'webhook_deliveries';
    protected $fillable = [
        'subscription_id', 'company_id', 'event', 'payload',
        'http_status', 'response_snippet', 'delivered_at',
    ];
    protected $casts = [
        'payload'      => 'array',
        'delivered_at' => 'datetime',
    ];
}
