<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Read-only для пользователей. Изменения только через CurrencyService (триггеры в БД). */
class CurrencyBalance extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'currency_balances';
    public $timestamps = false;
    protected $fillable = ['user_id', 'company_id', 'balance'];
    protected $casts = ['balance' => 'integer', 'updated_at' => 'datetime'];
}
