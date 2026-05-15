<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CompanyCurrencySettings extends Model
{
    use HasUuids;

    protected $table = 'company_currency_settings';
    protected $fillable = ['company_id', 'currency_name', 'currency_icon'];
}
