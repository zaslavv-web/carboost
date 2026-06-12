<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ProbationCriterion extends Model
{
    use HasUuids;

    protected $table = 'probation_criteria';
    protected $fillable = [
        'probation_id', 'title', 'description', 'weight',
        'is_met', 'met_at', 'marked_by', 'comment',
    ];
    protected $casts = [
        'is_met' => 'boolean',
        'weight' => 'decimal:2',
        'met_at' => 'datetime',
    ];
}
