<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class PortalPostComment extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'portal_post_comments';
    protected $fillable = ['company_id','post_id','author_id','parent_id','body'];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->author_id) && ($u = auth()->user())) {
                $m->author_id = $u->id;
            }
        });
        static::created(fn (self $m) => static::syncCount($m->post_id));
        static::deleted(fn (self $m) => static::syncCount($m->post_id));
    }

    /** Пересчитывает comments_count у поста (счётчик в ленте). */
    public static function syncCount(?string $postId): void
    {
        if (! $postId) return;
        $count = DB::table('portal_post_comments')->where('post_id', $postId)->count();
        DB::table('portal_posts')->where('id', $postId)->update(['comments_count' => $count]);
    }
}
