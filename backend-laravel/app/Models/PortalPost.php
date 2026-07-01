<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PortalPost extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_posts';
    protected $fillable = [
        'company_id','author_id','community_id','kind','title','body_md',
        'attachments','is_pinned','published_at','views_count','reactions_count','comments_count',
    ];
    protected $casts = [
        'attachments'   => 'array',
        'is_pinned'     => 'boolean',
        'published_at'  => 'datetime',
        'views_count'   => 'integer',
        'reactions_count' => 'integer',
        'comments_count'  => 'integer',
    ];
}
