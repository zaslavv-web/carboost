<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PulseSurveyResponse extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'pulse_survey_responses';
    protected $fillable = [
        'company_id','survey_id','question_id','user_id',
        'value_number','value_text','value_json',
    ];
    protected $casts = [
        'value_json'   => 'array',
        'value_number' => 'integer',
    ];
}
