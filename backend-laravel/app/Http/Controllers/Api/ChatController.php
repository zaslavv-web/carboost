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

    private function isSuperadmin(): bool
    {
        $user = auth()->user();
        return $user && method_exists($user, 'hasRole') && $user->hasRole('superadmin');
    }

    private function isSupportUser(string $userId): bool
    {
        return (bool) DB::table('profiles')->where('user_id', $userId)->value('is_support');
    }

    public function index(Request $request): JsonResponse
    {
        $userId = auth()->id();
        $companyId = $this->userCompanyId();
        $isSuper = $this->isSuperadmin();

        $convoIds = ChatParticipant::where('user_id', $userId)->pluck('conversation_id');

        $conversations = ChatConversation::query()
            ->whereIn('id', $convoIds)
            // Суперадмин видит все свои диалоги независимо от company_id (он пишет в любую компанию).
            ->when(!$isSuper && $companyId, fn ($q) => $q->where('company_id', $companyId))
            ->orderByDesc('last_message_at')
            ->orderByDesc('updated_at')
            ->get();

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

        $peerUserIds = $participants->flatten()->pluck('user_id')->unique()->all();
        $profiles = Profile::whereIn('user_id', $peerUserIds)
            ->get(['user_id', 'full_name', 'avatar_url', 'position_id', 'company_id', 'is_support'])
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

            $peerProfile = null;
            $peerIsSupport = false;
            if ($c->type === 'direct') {
                $peer = $convParticipants->firstWhere('user_id', '!=', $userId);
                if ($peer) {
                    $peerProfile = $profiles[$peer->user_id] ?? null;
                    $peerIsSupport = (bool) optional($peerProfile)->is_support;
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
                    'is_support' => (bool) optional($profiles[$p->user_id] ?? null)->is_support,
                ])->values(),
                'peer'            => $peerProfile ? [
                    'user_id'    => $peerProfile->user_id,
                    'full_name'  => $peerProfile->full_name,
                    'avatar_url' => $peerProfile->avatar_url,
                    'is_support' => (bool) $peerProfile->is_support,
                ] : null,
                'is_support'      => $peerIsSupport,
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
            'peer_user_id' => 'required_if:type,direct|string|min:1',
            'title'        => 'nullable|string|max:255',
            'participant_ids' => 'array',
            'participant_ids.*' => 'string|min:1',
        ]);

        $type = $data['type'] ?? 'direct';
        $userId = auth()->id();
        $companyId = $this->userCompanyId();
        $isSuper = $this->isSuperadmin();

        if ($type === 'direct') {
            $peerId = trim((string) $data['peer_user_id']);
            if ($peerId === $userId) {
                return response()->json(['error' => 'Нельзя создать диалог с самим собой'], 422);
            }

            $peerProfile = Profile::where('user_id', $peerId)->first();
            if (!$peerProfile) {
                \Log::warning('chat.store: peer not found', ['peer_user_id' => $peerId, 'by' => $userId]);
                return response()->json(['error' => 'Пользователь не найден'], 404);
            }

            $peerIsSupport    = (bool) $peerProfile->is_support;
            $peerIsSuperadmin = DB::table('user_roles')->where('user_id', $peerId)->where('role', 'superadmin')->exists();

            // Разрешено вне компании только если одна из сторон — суперадмин или техподдержка.
            $crossCompanyAllowed = $isSuper || $peerIsSuperadmin || $peerIsSupport;

            if (!$crossCompanyAllowed) {
                if (!$companyId) {
                    return response()->json(['error' => 'Не указана компания'], 422);
                }
                if ((string) $peerProfile->company_id !== (string) $companyId) {
                    return response()->json(['error' => 'Пользователь не найден в вашей компании'], 404);
                }
            }

            // company_id диалога: компания обычного пользователя из пары; если оба суперадмина — null.
            $convCompanyId = $companyId
                ?? ($peerProfile->company_id ? (string) $peerProfile->company_id : null);

            // Идемпотентно: ищем существующий direct между этими двумя.
            $existing = ChatConversation::query()
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

            return DB::transaction(function () use ($convCompanyId, $userId, $peerId) {
                $c = ChatConversation::create([
                    'company_id'  => $convCompanyId,
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

        // group (MVP — внутри одной компании)
        if (!$companyId) {
            return response()->json(['error' => 'Не указана компания'], 422);
        }
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
        $userId = auth()->id();
        $companyId = $this->userCompanyId();
        $isSuper = $this->isSuperadmin();
        $q = trim((string) $request->get('q', ''));

        $hasSupportColumn = \Illuminate\Support\Facades\Schema::hasColumn('profiles', 'is_support');

        // Базовый запрос
        $query = Profile::query()->where('user_id', '!=', $userId);

        if ($isSuper) {
            // Суперадмин ищет по всей платформе — исключая саму техподдержку из общего списка
            if ($hasSupportColumn) {
                $query->where(function ($w) {
                    $w->where('is_support', false)->orWhereNull('is_support');
                });
            }
        } else {
            // Обычный пользователь — только своя компания (+ техподдержку добавим отдельно ниже).
            if (!$companyId) {
                // без компании — только техподдержка
                $support = $hasSupportColumn ? $this->buildSupportContacts($q) : [];
                return response()->json(['data' => $support]);
            }
            $query->where('company_id', $companyId);
            if ($hasSupportColumn) {
                $query->where(function ($w) {
                    $w->where('is_support', false)->orWhereNull('is_support');
                });
            }
        }

        // Поиск по ФИО (profiles.full_name) и по email (users.email).
        // Используем LIKE + LOWER() — кросс-БД совместимо и регистронезависимо.
        if ($q !== '') {
            $needle = '%' . mb_strtolower($q) . '%';
            $query->where(function ($w) use ($needle) {
                $w->whereRaw("LOWER(COALESCE(full_name, '')) LIKE ?", [$needle])
                  ->orWhereIn('user_id', function ($sub) use ($needle) {
                      $sub->select('id')->from('users')
                          ->whereRaw('LOWER(email) LIKE ?', [$needle]);
                  });
            });
        }

        $rows = $query->orderBy('full_name')->limit(30)
            ->get(['user_id', 'full_name', 'avatar_url', 'department', 'company_id']);

        // Подмешиваем email и название компании.
        $userIds = $rows->pluck('user_id')->filter()->unique()->all();
        $emails = $userIds
            ? DB::table('users')->whereIn('id', $userIds)->pluck('email', 'id')->all()
            : [];

        $companyNames = [];
        if ($isSuper) {
            $companyIds = $rows->pluck('company_id')->filter()->unique()->all();
            if ($companyIds) {
                $companyNames = DB::table('companies')->whereIn('id', $companyIds)->pluck('name', 'id')->all();
            }
        }

        $contacts = $rows->map(fn ($r) => [
            'user_id'      => $r->user_id,
            'full_name'    => $r->full_name,
            'avatar_url'   => $r->avatar_url,
            'department'   => $r->department ?? null,
            'email'        => $emails[$r->user_id] ?? null,
            'company_name' => $isSuper ? ($companyNames[$r->company_id] ?? null) : null,
            'is_support'   => false,
        ])->values()->all();

        // Для обычного пользователя — техподдержка всегда сверху.
        if (!$isSuper && $hasSupportColumn) {
            $support = $this->buildSupportContacts($q);
            $contacts = array_merge($support, $contacts);
        }

        return response()->json(['data' => $contacts]);
    }

    private function buildSupportContacts(string $q): array
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('profiles', 'is_support')) {
            return [];
        }
        $query = Profile::query()->where('is_support', true);
        if ($q !== '') {
            // Если ищут — поддержку показываем только если запрос подходит к названию.
            $needle = mb_strtolower($q);
            $matchesLiteral = str_contains('техподдержка support помощь help', $needle);
            if (!$matchesLiteral) {
                return [];
            }
        }
        return $query->limit(3)->get(['user_id', 'full_name', 'avatar_url'])->map(fn ($r) => [
            'user_id'      => $r->user_id,
            'full_name'    => $r->full_name ?: 'Техподдержка',
            'avatar_url'   => $r->avatar_url,
            'department'   => null,
            'email'        => null,
            'company_name' => null,
            'is_support'   => true,
        ])->values()->all();
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
