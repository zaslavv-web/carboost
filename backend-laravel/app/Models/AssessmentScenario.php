<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AssessmentScenario extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'assessment_scenarios';
    protected $fillable = ['company_id', 'created_by', 'title', 'description', 'file_url', 'scenario_data', 'is_active'];
    protected $casts = ['scenario_data' => 'array', 'is_active' => 'boolean'];
}
