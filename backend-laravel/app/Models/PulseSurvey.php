<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PulseSurvey extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'pulse_surveys';
    protected $fillable = [
        'company_id','created_by','title','description','audience','audience_ref',
        'is_anonymous','status','starts_at','ends_at',
    ];
    protected $casts = [
        'is_anonymous' => 'boolean',
        'starts_at'    => 'datetime',
        'ends_at'      => 'datetime',
    ];

    public function questions()
    {
        return $this->hasMany(PulseSurveyQuestion::class, 'survey_id')->orderBy('order_index');
    }
}
