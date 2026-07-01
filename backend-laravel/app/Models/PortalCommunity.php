<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PortalCommunity extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_communities';
    protected $fillable = [
        'company_id','title','slug','description','cover_url','privacy','owner_id','members_count',
    ];
    protected $casts = ['members_count' => 'integer'];
}
