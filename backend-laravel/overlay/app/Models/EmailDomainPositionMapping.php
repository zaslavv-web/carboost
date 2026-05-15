<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmailDomainPositionMapping extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'email_domain_position_mappings';
    protected $fillable = ['email_domain', 'position_id', 'company_id', 'created_by'];
}
