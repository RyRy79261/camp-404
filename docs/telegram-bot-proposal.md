# Telegram Bot Proposal

> Plan for the Camp 404 Telegram bot: a service account that lives in the
> camp's main group chat and announcement channel, hands every approved
> member a personal join link, and posts unlock / announcement messages
> from the app instead of from a human's phone.

## Goal

When the captain marks a member as approved, the camp's bot mints a
single-use invite link to the members-only Telegram group, the member
taps it and joins, and the bot links their Telegram identity back to
their camp profile. Separately, the bot posts announcements (phase
unlocks, dust days, last-call reminders) to a broadcast channel — fanned
out from the same app that already composes in-app + push broadcasts.

Camp size is ~30–80 people. The volume is low, but the *moments* matter:
"you're in" and "the gates just opened" are exactly the messages people
want a real notification for, not a buried in-app banner.

## Why a bot, not a notification

The existing `broadcasts` / `notification_deliveries` pipeline does
per-user push + in-app messages well, but it doesn't give us:

- A persistent shared chat the group can talk in.
- A public-ish announcement surface for "today is dust day" posts.
- A path for the camp to keep using the messenger they already use
  daily (Telegram), instead of asking everyone to install another app.

So the bot is additive, not a replacement. Push is "your action
required"; Telegram is "the camp is doing a thing".

## The Telegram API constraint to design around

**Bots cannot silently add a user to a group by `@handle`.** Telegram
only lets a bot add a user it has the numeric `user_id` for, *and* only
after the user has interacted with the bot first. Inviting by username
has been deprecated for years.

The reliable, supported pattern is:

1. On approval, bot calls `createChatInviteLink` with `member_limit: 1`
   and an `expire_date`. Telegram returns a `t.me/+…` URL keyed to that
   one use.
2. App surfaces the link to the approved user — in-app banner + push,
   re-using the existing notification system.
3. User taps it → joins. Bot receives a `chat_member` update on its
   webhook carrying the link that was used to join, which we use as the
   correlation id between *which member joined* and *which camp user
   owns that link*.
4. We mark the invite `used`, store the user's `telegram_user_id`, and
   the link is now spent.

This means the bot's job is "issue + observe", not "add". The UX shifts
from "we added you" to "tap your one-tap link" — a small change, but the
only mechanism that actually works.

## Architecture

```
                                 ┌───────────────┐
                                 │  Telegram     │
                                 │  Bot API      │
                                 └───────┬───────┘
                                         │
                  ┌─── invite link ──────┤───── chat_member ──┐
                  │                      │                    │
       ┌──────────▼──────────┐  ┌────────▼─────────┐   ┌──────▼──────┐
       │  issueGroup…(user)  │  │  sendMessage     │   │  webhook    │
       │  → creates row in   │  │  ← drains rows   │   │  /api/      │
       │  telegram_invites   │  │  in telegram_    │   │  telegram/  │
       │                     │  │  announcements   │   │  webhook    │
       └──────────┬──────────┘  └────────▲─────────┘   └──────┬──────┘
                  │                      │                    │
                  │             ┌────────┴─────────┐          │
                  │             │ queueAnnouncement│          │
                  │             │ (body, sendAfter)│          │
                  │             └──────────────────┘          │
                  │                                           │
                  │       ┌─────────────────────┐             │
                  └──────▶│  Postgres (Neon)    │◀────────────┘
                          │  + Drizzle ORM      │
                          └─────────────────────┘
```

Three tables (`telegram_chats`, `telegram_invites`, `telegram_
announcements`) plus two columns on `users`. The bot is one
serverless route receiving updates and one helper called from existing
business logic to mint invites or queue announcements.

## Schema

Migration `0004_kind_the_hand.sql` is already applied and on the
branch. The shape:

```ts
// users — additions
telegramHandle: text("telegram_handle"),       // denormalised from
                                               // burner_profiles
telegramUserId: text("telegram_user_id").unique(), // set on first join

// telegram_chats — bot's registry of the chats it manages.
//   kind: 'main_group' | 'announcement_channel'
//   chatId: stored as text (Telegram chat ids are 64-bit signed; channels
//   are negative; JS Number rounds them).
//   archivedAt: NULL = active; non-NULL = retired.

// telegram_invites — single-use links per user.
//   pending → used (on chat_member) | expired | revoked
//   chatId: not an FK; archiving the chat keeps the historical row.
//   inviteLink: unique — used as the correlation key from webhook updates.

// telegram_announcements — outbound queue.
//   queued → sent (with telegram message_id) | failed (with error_message)
//   sendAfter: defaults to now(); future-date for scheduled posts.
//   broadcastId: optional FK to broadcasts for cross-reference.
```

### Why a separate table instead of extending `notification_channel`

`notification_deliveries` is a per-user inbox. Telegram announcements
are per-chat (one post, N readers). Modelling them as a fan-out into
`notification_deliveries` would create N rows for one post. So they live
in their own table with a chat-level shape.

Per-user Telegram DMs (e.g. "we approved you — here's your link") *do*
fit `notification_deliveries`, and that's how the invite link will be
delivered — through the existing pipeline once the in-app banner work
lands.

## Package shape

`@camp404/telegram` (new workspace):

- `src/client.ts` — `TelegramClient` thin wrapper over the Bot HTTP API,
  injectable fetch, custom `TelegramApiError`, `escapeMarkdownV2` for
  formatting. No framework dependency; ~170 lines.
- `src/webhook.ts` — Zod schema for the slice of `Update` we consume,
  `verifyWebhookSecret` (constant-time compare against
  `X-Telegram-Bot-Api-Secret-Token`), `parseUpdate`.
- `src/handlers.ts` — the four business-logic entry points:
  - `issueGroupInviteForUser({ client, userId })` — idempotent;
    reuses a non-expired pending invite if one exists for the main
    group, otherwise creates one and persists it.
  - `handleChatMemberUpdate(update)` — called by the webhook; marks
    invites used and records `telegram_user_id` on a join.
  - `queueAnnouncement({ body, sendAfter?, chatId? })` — defaults to
    the active `announcement_channel`.
  - `dispatchPendingAnnouncements({ client, limit? })` — drains the
    queue; marks rows sent or failed.

DB queries live in `@camp404/db/telegram` — one Drizzle file alongside
the existing `burner-profile.ts` / `invite-codes.ts` / `mcp.ts`.

## Web routes

- `POST /api/telegram/webhook` — verifies the secret header, parses the
  update, dispatches `chat_member` to `handleChatMemberUpdate`. Always
  returns 200 on a valid secret (a single bad update should not stall
  Telegram's retry queue).
- `GET /api/cron/telegram/dispatch` — gated by `Authorization: Bearer
  ${CRON_SECRET}`; calls `dispatchPendingAnnouncements`. **Currently
  not scheduled** — see "Outstanding" below.

## Status

### Built ✅

- DB schema + migration (`packages/db/migrations/0004_kind_the_hand.sql`,
  `packages/db/src/schema.ts:147-176`, `:613-694`).
- Drizzle queries (`packages/db/src/telegram.ts`).
- `@camp404/telegram` package, full handler set, 23 unit tests.
- Webhook route (`apps/web/app/api/telegram/webhook/route.ts`).
- Dispatch route (`apps/web/app/api/cron/telegram/dispatch/route.ts`).
- Env wiring: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` in
  `.env.example` and `turbo.json` globalEnv.

### Outstanding 📋

In rough order of when each blocks the next:

1. **Bot account + chat registration.** No bot exists yet. One-time
   operational work: create the bot with @BotFather, generate
   `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`), make the bot
   admin of both the main group and the announcement channel, call
   `setWebhook` once with `allowed_updates: ["chat_member"]` pointing
   at the deployed `/api/telegram/webhook`, and seed the
   `telegram_chats` rows for each. Needs a small CLI command on
   `@camp404/admin-cli` (`camp404 telegram register-chat …`).

2. **Approval trigger.** `issueGroupInviteForUser(userId)` is a helper
   that nobody calls yet. There is no single `users.approved` flag —
   "approved" is currently the conjunction of "passed the invite-code
   gate" + "completed the burner profile" + (eventually) "dues paid".
   Decide the one moment we treat as approval and call the helper
   there. Likeliest candidate: when the captain reviews a member and
   flips them from `pending_review` to `member` in the (to-be-built)
   captain admin UI — at which point a `users.approved_at` column
   probably wants to exist anyway.

3. **Surface the invite link to the user.** Once the invite row is
   minted, the user needs to *see* the link. Easiest path: re-use
   the existing broadcast pipeline — fan out a per-user
   `notification_delivery` with `refType: 'telegram_invite'` and
   `refId: telegram_invites.id`, render an in-app banner ("Join the
   camp Telegram → tap to open") that resolves to the link. Push
   notification fires through the same pipeline.

4. **Re-enable the dispatch cron.** It's wired up but currently
   commented out of `vercel.json` because the project is on a Vercel
   plan that only accepts daily cron schedules, and a 24-hour delay
   for an announcement is too long. Two paths once we're ready:
   - Upgrade the project plan to one that allows sub-daily crons,
     re-add `{ "path": "/api/cron/telegram/dispatch", "schedule":
     "*/5 * * * *" }`. Cleanest.
   - Stay on the current plan and call `dispatchPendingAnnouncements`
     directly from whichever route enqueued the announcement. The
     cron stops being needed for the immediate-send case; future-
     scheduled rows still need *something* to drain them (a daily
     cron is fine for that, with the understanding that a future-
     dated post lands within 24h of its `sendAfter`).

5. **Announcement composer UI / API.** Captain needs a way to write
   "Phase 2 unlocked!" and have it land in the channel. Probably
   slots into the same composer that creates `broadcasts`, with a
   "post to Telegram channel" checkbox that also writes a
   `telegram_announcements` row. Defer until #1-4 are working.

6. **Hardening, in order of how badly we'd miss them:**
   - Rate limit on `/api/telegram/webhook` — Telegram sends bursts.
   - Audit log entries (`audit_log`) for invite issued / used and
     announcement sent / failed.
   - Captain command surface in-chat (`/announce`, `/unlock`) —
     would let the camp lead post from their phone instead of the
     web UI. Cute, not urgent.
   - Backfill `users.telegram_handle` from `burner_profiles.responses`
     for users who completed the questionnaire before the column
     existed.

### Deliberately out of scope

- **DMs from the bot.** The bot does not message members directly. The
  invite link goes via the in-app + push notification system; the bot
  only ever posts to chats it manages.
- **Group moderation.** No `/kick`, no `/mute`, no spam handling. The
  bot is a service account, not a mod.
- **Multi-bot or multi-camp.** One bot, one main group, one announcement
  channel. The schema accommodates more rows, but the handlers assume
  the first active row of each kind.

## Operational runbook (for when #1 in Outstanding happens)

1. `@BotFather` → `/newbot` → name + username → grab the token.
2. `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET`.
3. Add both env vars to Vercel project settings *and* `.env.local`.
4. Promote the bot to admin in the camp's Telegram group:
   - Group → Manage → Administrators → Add → search bot username.
   - Permissions: "Invite Users via Link" (required for
     `createChatInviteLink`); "Delete Messages" optional.
5. Same for the announcement channel — needs "Post Messages".
6. From the admin-cli or a one-shot script:
   ```ts
   import { TelegramClient } from "@camp404/telegram/client";
   import { upsertChat } from "@camp404/db/telegram";
   const client = new TelegramClient({ botToken: process.env.TELEGRAM_BOT_TOKEN! });
   await upsertChat({ kind: "main_group", chatId: "-100123…",
     title: "Camp 404", username: null, addedByUserId: null });
   await client.setWebhook({
     url: "https://www.camp-404.com/api/telegram/webhook",
     secretToken: process.env.TELEGRAM_WEBHOOK_SECRET!,
     allowedUpdates: ["chat_member"],
   });
   ```
   (Getting the numeric `chatId` for a private group: forward any
   message from the group to `@RawDataBot`.)
7. Smoke test: call `issueGroupInviteForUser` for a test user, tap
   the link, confirm the `telegram_invites` row flips to `used` and
   `users.telegram_user_id` is populated.

## File map

| Concern | Path |
| --- | --- |
| Schema | `packages/db/src/schema.ts` (telegram_* tables + user columns) |
| Migration | `packages/db/migrations/0004_kind_the_hand.sql` |
| Drizzle queries | `packages/db/src/telegram.ts` |
| Bot HTTP client | `packages/telegram/src/client.ts` |
| Webhook parser + secret check | `packages/telegram/src/webhook.ts` |
| Business handlers | `packages/telegram/src/handlers.ts` |
| Web — webhook receiver | `apps/web/app/api/telegram/webhook/route.ts` |
| Web — queue dispatcher | `apps/web/app/api/cron/telegram/dispatch/route.ts` |
| Env scaffolding | `.env.example`, `turbo.json` |
| Tests | `packages/telegram/src/__tests__/*.test.ts` (23 tests) |
