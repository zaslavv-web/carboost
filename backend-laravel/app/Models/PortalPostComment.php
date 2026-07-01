<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PortalPostComment extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_post_comments';
    protected $fillable = ['company_id','post_id','author_id','parent_id','body'];
}
