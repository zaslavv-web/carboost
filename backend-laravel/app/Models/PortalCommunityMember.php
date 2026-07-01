<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PortalCommunityMember extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_community_members';
    protected $fillable = ['company_id','community_id','user_id','role'];
}
