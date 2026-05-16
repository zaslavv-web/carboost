<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Read-only — append через CurrencyService с пересчётом баланса. */
class CurrencyTransaction extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'currency_transactions';
    public $timestamps = false;
    protected $fillable = ['user_id', 'company_id', 'amount', 'kind', 'description', 'reference_id', 'created_by'];
    protected $casts = ['amount' => 'integer', 'created_at' => 'datetime'];
}
