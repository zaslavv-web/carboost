<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PulseSurveyQuestion extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'pulse_survey_questions';
    protected $fillable = ['company_id','survey_id','order_index','kind','title','options','is_required'];
    protected $casts = [
        'options'     => 'array',
        'is_required' => 'boolean',
        'order_index' => 'integer',
    ];
}
