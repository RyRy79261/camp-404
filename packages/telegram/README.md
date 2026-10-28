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
- **Group chats (on, 2026-10-26):** `handleGroupMessage` reads only
  `/notifyhere` (a connected captain adds the chat or topic Ol' Jeb posts
  in) and a group's move to a supergroup; `telegramPostSender` is the post
  drain's send (`@camp404/db/telegram-posts`), into the topic when there is
  one.
- **Status:** the group invite on approval (`issueGroupInviteForUser`) is
  built and tested but deliberately not called. The old announcement queue
  (`queueAnnouncement`, `dispatchPendingAnnouncements`) was deleted
  (2026-10-28): the post drain replaced it. See
  [`DEFERRED.md`](../../DEFERRED.md).

```bash
pnpm --filter @camp404/telegram test
```
