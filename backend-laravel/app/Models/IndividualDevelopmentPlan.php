<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class IndividualDevelopmentPlan extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'individual_development_plans';
    protected $fillable = [
        'company_id', 'user_id', 'created_by',
        'title', 'summary', 'period', 'starts_at', 'ends_at', 'status',
    ];
    protected $casts = [
        'starts_at' => 'date',
        'ends_at'   => 'date',
    ];

    public function items()
    {
        return $this->hasMany(IdpItem::class, 'idp_id')->orderBy('order_index');
    }
}
