<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PricingInquiry extends Model
{
    use HasUuids;

    protected $table = 'pricing_inquiries';
    protected $fillable = [
        'name', 'email', 'company', 'phone', 'plan',
        'headcount', 'message', 'status', 'admin_notes', 'source',
    ];
    protected $casts = ['headcount' => 'integer'];
}
