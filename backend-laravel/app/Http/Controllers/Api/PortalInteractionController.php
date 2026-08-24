<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PortalCommunityMember;
use App\Models\PortalPostReaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PortalInteractionController extends Controller
{
    public function toggleReaction(Request $request, string $postId)
    {
        $user = $request->user();
        $companyId = $user?->companyId();
        abort_unless($user && $companyId, 403);

        $post = DB::table('portal_posts')->where('id', $postId)->where('company_id', $companyId)->first();
        abort_unless($post, 404);
        $emoji = (string) $request->input('emoji', '👍');

        $active = DB::transaction(function () use ($postId, $user, $companyId, $emoji) {
            $existing = DB::table('portal_post_reactions')
                ->where('post_id', $postId)->where('user_id', $user->id)->where('emoji', $emoji)
                ->lockForUpdate()->first();
            if ($existing) {
                DB::table('portal_post_reactions')->where('id', $existing->id)->delete();
                PortalPostReaction::syncCount($postId);
                return false;
            }
            DB::table('portal_post_reactions')->insert([
                'id' => (string) Str::uuid(), 'company_id' => $companyId, 'post_id' => $postId,
                'user_id' => $user->id, 'emoji' => $emoji, 'created_at' => now(), 'updated_at' => now(),
            ]);
            PortalPostReaction::syncCount($postId);
            return true;
        });

        return response()->json(['active' => $active, 'count' => DB::table('portal_post_reactions')->where('post_id', $postId)->count()]);
    }

    public function joinCommunity(Request $request, string $communityId)
    {
        $user = $request->user();
        $companyId = $user?->companyId();
        abort_unless($user && $companyId, 403);
        $community = DB::table('portal_communities')->where('id', $communityId)->where('company_id', $companyId)->first();
        abort_unless($community, 404);
        if ($community->privacy !== 'open') {
            return response()->json(['error' => 'Для закрытого сообщества требуется приглашение владельца'], 403);
        }

        $member = DB::transaction(function () use ($communityId, $user, $companyId) {
            $id = DB::table('portal_community_members')->where('community_id', $communityId)->where('user_id', $user->id)->value('id');
            if (! $id) {
                $id = (string) Str::uuid();
                DB::table('portal_community_members')->insert([
                    'id' => $id, 'company_id' => $companyId, 'community_id' => $communityId,
                    'user_id' => $user->id, 'role' => 'member', 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            PortalCommunityMember::syncCount($communityId);
            return DB::table('portal_community_members')->where('id', $id)->first();
        });
        return response()->json(['data' => $member]);
    }

    public function leaveCommunity(Request $request, string $communityId)
    {
        $user = $request->user();
        $companyId = $user?->companyId();
        abort_unless($user && $companyId, 403);
        DB::transaction(function () use ($communityId, $user, $companyId) {
            DB::table('portal_community_members')->where('company_id', $companyId)
                ->where('community_id', $communityId)->where('user_id', $user->id)
                ->where('role', '!=', 'owner')->delete();
            PortalCommunityMember::syncCount($communityId);
        });
        return response()->json(['data' => ['left' => true]]);
    }
}