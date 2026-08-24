<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class PortalCommunityMember extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_community_members';
    protected $fillable = ['company_id','community_id','user_id','role'];

    protected static function booted(): void
    {
        static::created(fn (self $member) => static::syncCount($member->community_id));
        static::deleted(fn (self $member) => static::syncCount($member->community_id));
    }

    public static function syncCount(?string $communityId): void
    {
        if (! $communityId) return;
        $count = DB::table('portal_community_members')->where('community_id', $communityId)->count();
        DB::table('portal_communities')->where('id', $communityId)->update(['members_count' => $count]);
    }
}
