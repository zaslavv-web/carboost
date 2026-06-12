<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DisciplinaryCriterion extends Model
{
    use HasUuids;

    protected $table = 'disciplinary_criteria';
    protected $fillable = [
        'record_id', 'title', 'description',
        'is_met', 'met_at', 'marked_by', 'evidence_url', 'comment',
    ];
    protected $casts = [
        'is_met' => 'boolean',
        'met_at' => 'datetime',
    ];
}
