<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ShopCartItem extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'shop_cart_items';
    protected $fillable = [
        'user_id', 'company_id', 'product_id', 'quantity',
    ];
    protected $casts = [
        'quantity' => 'integer',
    ];

    public function product()
    {
        return $this->belongsTo(ShopProduct::class, 'product_id');
    }
}
