<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Course extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'courses';

    protected $fillable = [
        'company_id', 'title', 'slug', 'description', 'cover_url', 'level',
        'duration_min', 'tags', 'competencies', 'status', 'mandatory', 'author_id',
    ];

    protected $casts = [
        'tags'         => 'array',
        'competencies' => 'array',
        'mandatory'    => 'boolean',
        'duration_min' => 'integer',
    ];
}
