# Ol' Jeb: Camp 404's Telegram bot

Status: mock-up approved (2026-10-26). Step 1 (link and send) shipped in
#403 and #404. Step 2 (the camp's chats) built on `feat/telegram-ol-jeb-groups`
to the owner's approved mock-up of 2026-10-26
(`2026-10-26-telegram-ol-jeb-step2-mockup.png`); step 3 not started.
Owner's calls so far: the bot is **Jebediah**, shown as "Ol' Jeb" (2026-10-24), username `@jebediah_404_bot` (2026-10-25); it posts
in the camp group AND sends each member their own notices (option 2,
2026-10-25). This replaces the "no DMs" line in
`docs/telegram-bot-proposal.md`.

Reference: Baumy Brain (`~/repos/Personal/baumy-brain`,
`docs/spec/telegram.md`). We copy its webhook, linking and button patterns.
We do NOT copy its Inngest scheduling: Camp 404 runs no cron (AGENTS.md, No
cron jobs).

## Why

Push needs an installed browser permission that many phones drop, and email
is slow and loud. The camp already reads Telegram every day. A notice from
Ol' Jeb is the one a member actually sees: "your form is due", "you are
accepted", "Build starts Friday".

## What a member sees

1. **Connect Telegram** (Profile, and a nudge in Today beside "Enable
   notifications"). The button opens `t.me/jebediah_404_bot?start=<code>`. The member
   taps Start in Telegram. Ol' Jeb answers "Hey <name>, you're all set. Your camp notices will land here now."
2. **Their notices in Telegram.** Each notice that goes by push also goes to
   Telegram, as the title, a short plain body and an "Open in Camp 404"
   button. Nothing private is in it (no safety data, no ID, no money detail):
   the same text push already shows on a lock screen.
3. **A switch:** "Only notices about me" (the default, owner 2026-10-26:
   forms they owe, their tasks, approval, promotion, car, pet;
   `isPersonalNotification`) or "All my notices" (camp announcements and
   team messages too).
4. **Disconnect**, in the app, or by blocking the bot in Telegram (the
   webhook sees it and unlinks).
5. **The camp group.** On approval the member gets their one-use invite link
   to the camp group (already built: `issueGroupInviteForUser`).

## What a captain sees

- Camp settings gets an "Ol' Jeb" card: is the bot set up, which group is
  the camp group, and a "Set up Ol' Jeb" button that registers the webhook
  and the command menu. No CLI step for the owner (no manual operator steps).
- When Ol' Jeb is added to a Telegram group, the card offers "Use this group
  as the camp group". A captain confirms; audited.
- The announcement composer gets "Also post in the camp Telegram group"
  (captains only; queues `telegram_announcements`, already built).

[CORRECTION 2026-10-26, the approved step 2 mock-up] There is no "Set up Ol'
Jeb" button (each production deploy registers him) and no "Use this group"
confirm in the app. A captain who connected Telegram sends `/notifyhere` in
the group, or in a topic of a supergroup, and Ol' Jeb answers "Got it!"
(anyone else: "Sorry, only a captain who connected me in Camp 404 can do
that."); audited. Camp settings' Ol' Jeb card lists those chats with Remove,
has three ticks (announcements, questionnaire reminders with tags, new
meetings) and says how to add a chat. The composer's "Also post in Telegram"
is ticked by default and offered only for an announcement to everyone.

## How it works

- **Linking.** New table `telegram_link_codes`: a random code per press,
  only its SHA-256 stored, 10 minutes, used once (an atomic
  `UPDATE … WHERE unused AND unexpired`). `/start <code>` in a private chat
  writes `users.telegram_user_id` (the column exists) and
  `users.telegram_dm_at` (new: when the member opened the DM). A private
  chat's id is the user's id, so no second id is stored.
- **Webhook** (`/api/telegram/webhook`, exists). Add `message` (private
  `/start`, `/stop`), `my_chat_member` (blocked, unblocked, added to a group)
  and `callback_query` to `allowed_updates`. Dedupe on `update_id` (new small
  table, `ON CONFLICT DO NOTHING`). Bad secret 401; junk 200; our own failure
  503 so Telegram retries. Group text is never read (privacy mode stays on).
- **Sending.** `notification_deliveries.telegram_status` (new, like
  `email_status`): `queued` when the member is linked and the kind passes
  their switch, else `skipped`. A third drain in `deliverDue`, beside push and
  email: rows `FOR UPDATE SKIP LOCKED`, at most 25 a run, about 20 a second.
  A 429 ends the run (rows stay queued for the next page load). A 403 (the
  member blocked Ol' Jeb) unlinks them and skips their queued rows. A row
  older than 20 hours is marked failed, so a stale notice never arrives late.
  Only production sends (`mayContactMembers`).
- **Group posts.** `dispatchPendingAnnouncements` runs from the same drain.
- **Registration.** Done on each production deploy by
  `apps/web/scripts/register-telegram.mjs` (from `vercel-build`): setWebhook
  and setMyCommands, never failing the build.
- **Setup.** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (both read
  today), plus `TELEGRAM_BOT_USERNAME` for the deep link; all three in
  `.env.example` and turbo `globalEnv`. The webhook points at the production
  domain only, never a preview URL.

## Privacy and erasure

- `telegram_link_codes` and the dedupe table get `TABLE_LIFECYCLE` entries;
  erasure deletes link codes and clears `telegram_user_id`,
  `telegram_handle`, `telegram_dm_at`.
- A message never holds a value from `ALWAYS_PRIVATE` or `SAFETY_VISIBLE`.
  A test pins every notification kind's Telegram text to its push text.
- No member value in a log (`errorLogText`).

## Build order (one PR per step)

1. **Link and send.** Link codes, webhook `/start` and block handling,
   `telegram_status` + drain, Profile card, Today nudge, test-store twins and
   E2E for the card states.
2. **Captain card and group.** Set-up button, group pick, invite link on
   approval, "post in the group" on announcements. [CORRECTION 2026-10-26]
   Built: `/notifyhere`, the Ol' Jeb card, "Also post in Telegram", reminder
   tags, new-meeting posts and the welcome wizard's optional Telegram step
   (`@camp404/db/telegram-posts`). The invite link on approval is not in it.
3. **Tap to answer** (later, needs its own ask). Buttons on a notice that do
   one safe thing, e.g. Going / Can't on a logistics attendance ask. Code
   checks the tap; nothing is typed.

## Open questions for the owner

- ~~The bot's username~~ Settled 2026-10-25: `@jebediah_404_bot`, display name "Ol' Jeb".
- ~~Ol' Jeb's voice~~ Settled 2026-10-26: casual and friendly, never a cowboy (no "Howdy", no drawl). The notices themselves stay plain.

## Reminders without connecting (owner, 2026-10-26)

Telegram does not let a bot send the first private message ("Bots can't start
conversations with users", core.telegram.org/bots), and a bot cannot look a
person up by `@username`. So the owner chose:

- **Connected members** (tapped Start) get their reminders privately.
- **Everyone else** who owes a form is tagged by `@username` (the
  `users.telegram_handle` they typed) in a camp announcement post, e.g.
  "@cloud_404 @mike_404, the 'Coming this year?' form is due Friday."
  Everyone in that chat sees who has not answered; the owner accepted that.
- The Start tap also goes into onboarding as one optional step.
- Reminders follow the existing due-date reminders (`runDueWork`, 09:00 to
  21:00, on a page load, no cron).
- New meetings (a Meeting added in the Calendar) are also posted to the
  announcement chats (owner, 2026-10-26). Step 2.
- ~~Open: which chat gets the tags.~~ Settled 2026-10-26: every chat a
  captain added with `/notifyhere` (the announcements group and the topic in
  the supergroup; both are groups, so a tag pings). Tagged: who still owes the
  form, said Coming this year and has not connected Ol' Jeb; at most one post
  a camp day per form per chat. The handles are read when the post is sent,
  never stored with it.
