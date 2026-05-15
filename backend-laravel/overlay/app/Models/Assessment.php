<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Assessment extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'assessments';
    public $timestamps = false;
    protected $fillable = ['user_id', 'company_id', 'assessment_type', 'assessment_data', 'change_value', 'score'];
    protected $casts = ['assessment_data' => 'array', 'score' => 'integer', 'created_at' => 'datetime'];
}
