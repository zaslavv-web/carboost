<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class KnowledgeArticle extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'knowledge_articles';
    protected $fillable = [
        'company_id', 'category_id', 'author_id',
        'title', 'slug', 'excerpt', 'content_md', 'tags',
        'status', 'views_count', 'published_at',
    ];
    protected $casts = [
        'tags'         => 'array',
        'views_count'  => 'integer',
        'published_at' => 'datetime',
    ];
}
