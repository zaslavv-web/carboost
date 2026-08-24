<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class PortalPostReaction extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_post_reactions';
    protected $fillable = ['company_id','post_id','user_id','emoji'];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->user_id) && ($u = auth()->user())) {
                $m->user_id = $u->id;
            }
        });
        static::created(fn (self $m) => static::syncCount($m->post_id));
        static::deleted(fn (self $m) => static::syncCount($m->post_id));
    }

    /** Пересчитывает reactions_count у поста. */
    public static function syncCount(?string $postId): void
    {
        if (! $postId) return;
        $count = DB::table('portal_post_reactions')->where('post_id', $postId)->count();
        DB::table('portal_posts')->where('id', $postId)->update(['reactions_count' => $count]);
    }
}
