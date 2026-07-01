<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Competency extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'competencies';
    protected $fillable = ['user_id', 'company_id', 'skill_name', 'skill_value', 'category', 'target_value'];
    protected $casts = ['skill_value' => 'integer', 'target_value' => 'integer'];
}
