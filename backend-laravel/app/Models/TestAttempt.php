<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TestAttempt extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'test_attempts';

    protected $fillable = [
        'company_id', 'user_id', 'test_id', 'test_source',
        'answers', 'competency_breakdown', 'score', 'total',
    ];

    protected $casts = [
        'answers' => 'array',
        'competency_breakdown' => 'array',
        'score' => 'integer',
        'total' => 'integer',
    ];
}