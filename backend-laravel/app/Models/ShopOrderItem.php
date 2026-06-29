<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ShopOrderItem extends Model
{
    use HasUuids;

    protected $table = 'shop_order_items';
    protected $fillable = [
        'order_id', 'product_id', 'quantity', 'unit_price',
        'subtotal', 'product_title',
    ];
    protected $casts = [
        'quantity'   => 'integer',
        'unit_price' => 'integer',
        'subtotal'   => 'integer',
    ];

    public function order()
    {
        return $this->belongsTo(ShopOrder::class, 'order_id');
    }
}
