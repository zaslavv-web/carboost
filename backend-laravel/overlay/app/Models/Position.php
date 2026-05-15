<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Position extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'positions';
    protected $fillable = ['company_id', 'department_id', 'title', 'description', 'level', 'parent_position_id'];
}
