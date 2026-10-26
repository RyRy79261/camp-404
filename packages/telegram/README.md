# @camp404/telegram

A small Telegram Bot API client, the update handlers and the webhook check.

- **Exports:** `@camp404/telegram`, `/client`, `/handlers`, `/webhook`.
- **Depends on:** `@camp404/core`, `@camp404/db`.
- **Imported by:** `apps/web`: the inbound webhook at
  `app/api/telegram/webhook` is live.
- **Private chats (on, 2026-10-26):** `handlePrivateMessage` answers
  `/start <code>` (connects a member), `/stop` and anything else with one
  fixed sentence; `handleMyChatMember` stops a member who blocked the bot;
  `telegramNoticeSender` is the drain's send (`@camp404/db/telegram-dm`).
- **Status:** group outbound (group invites, posting announcements) is built and
  tested but deliberately not called. When the owner turns Telegram on, call
  `dispatchPendingAnnouncements` from `deliverDue` in
  `apps/web/lib/background-work.ts`. See [`DEFERRED.md`](../../DEFERRED.md).

```bash
pnpm --filter @camp404/telegram test
```
