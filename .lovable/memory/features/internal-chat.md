---
name: Internal Chats
description: Company-scoped messaging with floating launcher, 1:1 MVP, polling, support contact in every company, superadmin global reach
type: feature
---
- Floating ChatLauncher in AppLayout + MobileEmployeeLayout, full page at /chats.
- Backend: Laravel ChatController, tables chat_conversations/participants/messages/reactions/permissions.
- MVP: 1:1 only, polling 7s (list) / 5s (thread), Reverb broadcast best-effort.
- Permissions extensible via ChatPermissionService (time windows, white/blacklists — todo).
- **Superadmin** sees all his conversations regardless of company_id and can DM any user platform-wide.
- **Support user**: single system account `support@career-track.app`, profile flag `is_support=true`, no company_id. Created by SupportUserSeeder. Pinned at top of contact list and conversation list for every non-superadmin user, with LifeBuoy icon and "24/7" badge. Cross-company DMs allowed when the peer is support or superadmin.
- Impersonation disables chat for safety.
