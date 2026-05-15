<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeQuestionnaireFile extends Model
{
    use HasUuids;

    protected $table = 'employee_questionnaire_files';
    public $timestamps = false;
    protected $fillable = ['questionnaire_id', 'file_path', 'file_name', 'file_type', 'file_size'];
    protected $casts = ['file_size' => 'integer', 'uploaded_at' => 'datetime'];

    public function questionnaire()
    {
        return $this->belongsTo(EmployeeQuestionnaire::class, 'questionnaire_id');
    }
}
