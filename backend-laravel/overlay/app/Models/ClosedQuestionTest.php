<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ClosedQuestionTest extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'closed_question_tests';
    protected $fillable = [
        'company_id', 'position_id', 'created_by', 'title', 'description',
        'questions', 'is_active', 'source_file_url', 'source_file_name',
    ];
    protected $casts = ['questions' => 'array', 'is_active' => 'boolean'];
}
