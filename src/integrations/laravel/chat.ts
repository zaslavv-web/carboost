import { laravel } from "./client";

export interface ChatPeer {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_support?: boolean;
}

export interface ChatLastMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  type: "direct" | "group" | "department";
  title: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  participants: Array<{
    user_id: string;
    role: string;
    full_name: string | null;
    avatar_url: string | null;
    is_support?: boolean;
  }>;
  peer: ChatPeer | null;
  is_support?: boolean;
  last_message: ChatLastMessage | null;
  unread_count: number;
}

export interface ChatMessageReactionGroup {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  reactions: ChatMessageReactionGroup[];
}

export interface ChatContact {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  company_name?: string | null;
  is_support?: boolean;
}


export const chatApi = {
  list: () => laravel.get<{ data: ChatConversation[] }>("/chats"),
  unreadCount: () => laravel.get<{ unread: number }>("/chats/unread-count"),
  contacts: (q: string) =>
    laravel.get<{ data: ChatContact[] }>(
      `/chats/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  createDirect: (peerUserId: string) =>
    laravel.post<{ data: { id: string } }>("/chats", {
      type: "direct",
      peer_user_id: peerUserId,
    }),
  messages: (conversationId: string, before?: string) =>
    laravel.get<{ data: ChatMessage[] }>(
      `/chats/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    ),
  send: (conversationId: string, body: string, replyToId?: string | null) =>
    laravel.post<{ data: ChatMessage }>(`/chats/${conversationId}/messages`, {
      body,
      reply_to_id: replyToId ?? null,
    }),
  markRead: (conversationId: string) =>
    laravel.patch<{ ok: boolean }>(`/chats/${conversationId}/read`, {}),
  toggleReaction: (conversationId: string, messageId: string, emoji: string) =>
    laravel.post<{ toggled: "on" | "off" }>(
      `/chats/${conversationId}/messages/${messageId}/reactions`,
      { emoji },
    ),
};
