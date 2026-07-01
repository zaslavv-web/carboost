<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PortalPostReaction extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_post_reactions';
    protected $fillable = ['company_id','post_id','user_id','emoji'];
}
