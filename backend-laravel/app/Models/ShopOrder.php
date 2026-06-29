<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ShopOrder extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'shop_orders';
    protected $fillable = [
        'user_id', 'company_id', 'total_amount', 'status',
        'cancel_reason', 'fulfilled_by', 'fulfilled_at',
    ];
    protected $casts = [
        'total_amount' => 'integer',
        'fulfilled_at' => 'datetime',
    ];

    public function items()
    {
        return $this->hasMany(ShopOrderItem::class, 'order_id');
    }
}
