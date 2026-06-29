<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ShopProduct extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'shop_products';
    protected $fillable = [
        'company_id', 'title', 'description', 'price', 'image_url',
        'stock', 'max_per_user', 'max_per_period', 'period_kind',
        'is_active', 'created_by',
    ];
    protected $casts = [
        'price' => 'integer',
        'stock' => 'integer',
        'max_per_user' => 'integer',
        'max_per_period' => 'integer',
        'is_active' => 'boolean',
    ];
}
