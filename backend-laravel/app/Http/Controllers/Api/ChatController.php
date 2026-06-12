<?php

namespace App\Http\Controllers\Api;

use App\Events\ChatMessageSent;
use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatMessageReaction;
use App\Models\ChatParticipant;
use App\Models\Profile;
use App\Services\ChatPermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Внутренние чаты компании (MVP).
 *
 * Эндпоинты:
 *   GET    /chats                              — список диалогов пользователя + unread
 *   POST   /chats                              — создать/получить direct-чат
 *   GET    /chats/contacts?q=                  — поиск сотрудников своей компании
 *   GET    /chats/{id}/messages?before=&limit= — пагинация сообщений
 *   POST   /chats/{id}/messages                — отправить
 *   PATCH  /chats/{id}/read                    — отметить прочитанным
 *   POST   /chats/{id}/messages/{mid}/reactions — toggle emoji
 *   GET    /chats/unread-count                 — суммарный счётчик
 */
class ChatController extends Controller
{
    public function __construct(private ChatPermissionService $permissions)
    {
    }

    private function userCompanyId(): ?string
    {
        $user = auth()->user();
        return method_exists($user, 'companyId') ? $user->companyId() : null;
    }

    public function index(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $companyId = $this->userCompanyId();

        $convoIds = ChatParticipant::where('user_id', $userId)->pluck('conversation_id');

        $conversations = ChatConversation::query()
            ->whereIn('id', $convoIds)
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->orderByDesc('last_message_at')
            ->orderByDesc('updated_at')
            ->get();

        // Прелоадим участников + last message + unread
        $participants = ChatParticipant::whereIn('conversation_id', $conversations->pluck('id'))
            ->get()
            ->groupBy('conversation_id');

        $lastMessages = ChatMessage::query()
            ->whereIn('conversation_id', $conversations->pluck('id'))
            ->whereNull('deleted_at')
            ->orderByDesc('created_at')
            ->get()
            ->groupBy('conversation_id')
            ->map(fn ($g) => $g->first());

        $myParticipants = $participants->map(
            fn ($g) => $g->firstWhere('user_id', $userId)
        );

        // Соберём профили всех собеседников
        $peerUserIds = $participants->flatten()->pluck('user_id')->unique()->all();
        $profiles = Profile::whereIn('user_id', $peerUserIds)
            ->get(['user_id', 'full_name', 'avatar_url', 'position_id'])
            ->keyBy('user_id');

        $data = $conversations->map(function (ChatConversation $c) use ($participants, $lastMessages, $myParticipants, $userId, $profiles) {
            $convParticipants = $participants[$c->id] ?? collect();
            $me = $myParticipants[$c->id] ?? null;
            $lastMsg = $lastMessages[$c->id] ?? null;

            $unread = 0;
            if ($lastMsg) {
                $unreadQuery = ChatMessage::where('conversation_id', $c->id)
                    ->whereNull('deleted_at')
                    ->where('sender_id', '!=', $userId);
                if ($me && $me->last_read_at) {
                    $unreadQuery->where('created_at', '>', $me->last_read_at);
                }
                $unread = $unreadQuery->count();
            }

            // Для direct: peer = тот, кто не я
            $peerProfile = null;
            if ($c->type === 'direct') {
                $peer = $convParticipants->firstWhere('user_id', '!=', $userId);
                if ($peer) {
                    $peerProfile = $profiles[$peer->user_id] ?? null;
                }
            }

            return [
                'id'              => $c->id,
                'type'            => $c->type,
                'title'           => $c->title,
                'last_message_at' => optional($c->last_message_at)->toIso8601String(),
                'updated_at'      => optional($c->updated_at)->toIso8601String(),
                'participants'    => $convParticipants->map(fn ($p) => [
                    'user_id'    => $p->user_id,
                    'role'       => $p->role,
                    'full_name'  => optional($profiles[$p->user_id] ?? null)->full_name,
                    'avatar_url' => optional($profiles[$p->user_id] ?? null)->avatar_url,
                ])->values(),
                'peer'            => $peerProfile ? [
                    'user_id'    => $peerProfile->user_id,
                    'full_name'  => $peerProfile->full_name,
                    'avatar_url' => $peerProfile->avatar_url,
                ] : null,
                'last_message'    => $lastMsg ? [
                    'id'         => $lastMsg->id,
                    'sender_id'  => $lastMsg->sender_id,
                    'body'       => $lastMsg->body,
                    'created_at' => optional($lastMsg->created_at)->toIso8601String(),
                ] : null,
                'unread_count'    => $unread,
            ];
        })->values();

        return response()->json(['data' => $data]);
    }

    public function unreadCount(): JsonResponse
    {
        $userId = auth()->id();
        $myParts = ChatParticipant::where('user_id', $userId)->get(['conversation_id', 'last_read_at']);

        $total = 0;
        foreach ($myParts as $p) {
            $q = ChatMessage::where('conversation_id', $p->conversation_id)
                ->whereNull('deleted_at')
                ->where('sender_id', '!=', $userId);
            if ($p->last_read_at) $q->where('created_at', '>', $p->last_read_at);
            $total += $q->count();
        }

        return response()->json(['unread' => $total]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type'         => 'nullable|in:direct,group',
            'peer_user_id' => 'required_if:type,direct|uuid',
            'title'        => 'nullable|string|max:255',
            'participant_ids' => 'array',
            'participant_ids.*' => 'uuid',
        ]);

        $type = $data['type'] ?? 'direct';
        $userId = auth()->id();
        $companyId = $this->userCompanyId();
        if (!$companyId) {
            return response()->json(['error' => 'Не указана компания'], 422);
        }

        if ($type === 'direct') {
            $peerId = $data['peer_user_id'];
            if ($peerId === $userId) {
                return response()->json(['error' => 'Нельзя создать диалог с самим собой'], 422);
            }
            // Peer должен быть в той же компании
            $peerProfile = Profile::where('user_id', $peerId)->where('company_id', $companyId)->first();
            if (!$peerProfile) {
                return response()->json(['error' => 'Пользователь не найден в вашей компании'], 404);
            }

            // Идемпотентно: ищем существующий direct между этими двумя.
            $existing = ChatConversation::query()
                ->where('company_id', $companyId)
                ->where('type', 'direct')
                ->whereIn('id', function ($q) use ($userId) {
                    $q->select('conversation_id')->from('chat_participants')->where('user_id', $userId);
                })
                ->whereIn('id', function ($q) use ($peerId) {
                    $q->select('conversation_id')->from('chat_participants')->where('user_id', $peerId);
                })
                ->first();

            if ($existing) {
                return response()->json(['data' => ['id' => $existing->id]]);
            }

            return DB::transaction(function () use ($companyId, $userId, $peerId) {
                $c = ChatConversation::create([
                    'company_id'  => $companyId,
                    'type'        => 'direct',
                    'created_by'  => $userId,
                ]);
                foreach ([$userId, $peerId] as $uid) {
                    ChatParticipant::create([
                        'conversation_id' => $c->id,
                        'user_id'         => $uid,
                        'role'            => $uid === $userId ? 'admin' : 'member',
                        'joined_at'       => now(),
                    ]);
                }
                return response()->json(['data' => ['id' => $c->id]], 201);
            });
        }

        // group
        $ids = array_unique(array_merge($data['participant_ids'] ?? [], [$userId]));
        $sameCompany = Profile::whereIn('user_id', $ids)->where('company_id', $companyId)->count();
        if ($sameCompany !== count($ids)) {
            return response()->json(['error' => 'Все участники должны быть из вашей компании'], 422);
        }
        return DB::transaction(function () use ($companyId, $userId, $ids, $data) {
            $c = ChatConversation::create([
                'company_id' => $companyId,
                'type'       => 'group',
                'title'      => $data['title'] ?? null,
                'created_by' => $userId,
            ]);
            foreach ($ids as $uid) {
                ChatParticipant::create([
                    'conversation_id' => $c->id,
                    'user_id'         => $uid,
                    'role'            => $uid === $userId ? 'admin' : 'member',
                    'joined_at'       => now(),
                ]);
            }
            return response()->json(['data' => ['id' => $c->id]], 201);
        });
    }

    public function contacts(Request $request): JsonResponse
    {
        $companyId = $this->userCompanyId();
        if (!$companyId) return response()->json(['data' => []]);

        $q = trim((string) $request->get('q', ''));
        $userId = auth()->id();

        $query = Profile::query()
            ->where('company_id', $companyId)
            ->where('user_id', '!=', $userId);
        if ($q !== '') {
            $query->where('full_name', 'ilike', '%' . $q . '%');
        }

        $rows = $query->orderBy('full_name')->limit(30)->get(['user_id', 'full_name', 'avatar_url', 'department']);
        return response()->json(['data' => $rows]);
    }

    private function ensureMember(string $conversationId): ChatConversation
    {
        $userId = auth()->id();
        $conv = ChatConversation::findOrFail($conversationId);
        $member = ChatParticipant::where('conversation_id', $conversationId)
            ->where('user_id', $userId)->exists();
        abort_unless($member, 403, 'Нет доступа к этому диалогу');
        return $conv;
    }

    public function messages(Request $request, string $id): JsonResponse
    {
        $this->ensureMember($id);
        $limit = min((int) $request->get('limit', 50), 200);
        $before = $request->get('before');

        $q = ChatMessage::where('conversation_id', $id)
            ->whereNull('deleted_at')
            ->orderByDesc('created_at')
            ->limit($limit);
        if ($before) $q->where('created_at', '<', $before);

        $msgs = $q->get();
        $reactions = ChatMessageReaction::whereIn('message_id', $msgs->pluck('id'))
            ->get()->groupBy('message_id');

        $data = $msgs->map(function ($m) use ($reactions) {
            $rs = ($reactions[$m->id] ?? collect())
                ->groupBy('emoji')
                ->map(fn ($g) => [
                    'emoji'    => $g->first()->emoji,
                    'count'    => $g->count(),
                    'user_ids' => $g->pluck('user_id')->values(),
                ])->values();
            return [
                'id'              => $m->id,
                'conversation_id' => $m->conversation_id,
                'sender_id'       => $m->sender_id,
                'body'            => $m->body,
                'reply_to_id'     => $m->reply_to_id,
                'created_at'      => optional($m->created_at)->toIso8601String(),
                'reactions'       => $rs,
            ];
        })->reverse()->values();

        return response()->json(['data' => $data]);
    }

    public function sendMessage(Request $request, string $id): JsonResponse
    {
        $conv = $this->ensureMember($id);
        $data = $request->validate([
            'body'        => 'required|string|max:8000',
            'reply_to_id' => 'nullable|uuid',
        ]);

        $user = auth()->user();
        if (!$this->permissions->canSend($user, $conv)) {
            return response()->json(['error' => 'Отправка сообщений временно недоступна'], 403);
        }

        $msg = ChatMessage::create([
            'conversation_id' => $id,
            'sender_id'       => $user->id,
            'body'            => $data['body'],
            'reply_to_id'     => $data['reply_to_id'] ?? null,
        ]);

        $conv->update(['last_message_at' => $msg->created_at]);

        try {
            broadcast(new ChatMessageSent($msg))->toOthers();
        } catch (\Throwable $e) {
            // Broadcast не критичен — polling всё равно подхватит.
            \Log::warning('ChatMessageSent broadcast failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => [
                'id'              => $msg->id,
                'conversation_id' => $msg->conversation_id,
                'sender_id'       => $msg->sender_id,
                'body'            => $msg->body,
                'reply_to_id'     => $msg->reply_to_id,
                'created_at'      => optional($msg->created_at)->toIso8601String(),
                'reactions'       => [],
            ],
        ], 201);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $this->ensureMember($id);
        ChatParticipant::where('conversation_id', $id)
            ->where('user_id', auth()->id())
            ->update(['last_read_at' => now()]);
        return response()->json(['ok' => true]);
    }

    public function toggleReaction(Request $request, string $id, string $messageId): JsonResponse
    {
        $this->ensureMember($id);
        $data = $request->validate(['emoji' => 'required|string|max:32']);

        $existing = ChatMessageReaction::where('message_id', $messageId)
            ->where('user_id', auth()->id())
            ->where('emoji', $data['emoji'])
            ->first();

        if ($existing) {
            $existing->delete();
            return response()->json(['toggled' => 'off']);
        }
        ChatMessageReaction::create([
            'message_id' => $messageId,
            'user_id'    => auth()->id(),
            'emoji'      => $data['emoji'],
        ]);
        return response()->json(['toggled' => 'on']);
    }
}
