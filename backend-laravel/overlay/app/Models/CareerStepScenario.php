<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CareerStepScenario extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'career_step_scenarios';
    protected $fillable = [
        'template_id', 'company_id', 'step_order', 'test_id',
        'requires_test', 'min_test_score', 'requires_files', 'min_files',
        'requires_comment', 'instructions', 'reinforced_instructions',
    ];
    protected $casts = [
        'step_order' => 'integer',
        'min_test_score' => 'integer',
        'min_files' => 'integer',
        'requires_test' => 'boolean',
        'requires_files' => 'boolean',
        'requires_comment' => 'boolean',
    ];
}
