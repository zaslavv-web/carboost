<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PositionCareerPath extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'position_career_paths';
    protected $fillable = ['from_position_id', 'to_position_id', 'company_id', 'description', 'requirements'];
    protected $casts = ['requirements' => 'array'];
}
