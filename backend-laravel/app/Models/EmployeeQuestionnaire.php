<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeQuestionnaire extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'employee_questionnaires';
    protected $fillable = [
        'user_id', 'company_id', 'position_id', 'other_position_title',
        'status', 'version', 'answers', 'skill_gaps', 'ai_interpretation',
        'submitted_at', 'confirmed_at', 'next_update_due_at',
    ];
    protected $casts = [
        'answers' => 'array',
        'skill_gaps' => 'array',
        'ai_interpretation' => 'array',
        'version' => 'integer',
        'submitted_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'next_update_due_at' => 'datetime',
    ];

    public function files()
    {
        return $this->hasMany(EmployeeQuestionnaireFile::class, 'questionnaire_id');
    }
}
