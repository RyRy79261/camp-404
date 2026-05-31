# 27 — Broadcast → delivery → inbox engine

**Files covered:**
- `apps/web/lib/notifications.ts` — Server-only facade: routes every announcement/notification read & write to the Neon-backed `@camp404/db/broadcasts` queries, or the in-memory `testStore` under `E2E_TEST_MODE`. App code imports from here, never `@camp404/db/broadcasts` directly.
- `packages/db/src/broadcasts.ts` — The data layer: draft CRUD, inline publish + fan-out, scheduled dispatch worker, recipient-side reads (inbox, unread count, pending acknowledgements), and the acknowledge/mark-read writes.
- `packages/db/src/audience.ts` — Pure (DB-free) scope→recipient-ids resolver (`computeAudience`) plus the `BroadcastScope` type.
- `apps/web/app/api/notifications/pending/route.ts` — `GET` handler the acknowledge gate polls for a member's unacknowledged full-screen deliveries.
- `apps/web/app/api/notifications/acknowledge/route.ts` — `POST` handler that dismisses one full-screen delivery on the member's behalf.
- `apps/web/app/acknowledgement-gate.tsx` — (adjacent, unit 25) the in-app consumer of the two API routes; included for the delivery→presentation contract.
- `apps/web/app/api/cron/notifications/dispatch/route.ts` — Cron entry point that drains deferred/scheduled broadcasts via `dispatchDueBroadcasts`.
- `apps/web/app/captains/announcements/actions.ts` — (adjacent, unit 15) captain-gated server actions that call the draft/publish facade; included for the gating + write contract.
- `apps/web/app/notifications/page.tsx` — (adjacent, unit 09) inbox page; included for the listInbox/markRead read-then-clear contract.
- `apps/web/app/home-header.tsx` — bell badge consumer of `countUnread`.
- `packages/types/src/announcement.ts` — `ComposeAnnouncementInput` + `AnnouncementPresentation` zod validators.
- `apps/web/lib/test-store.ts` — in-memory backend mirroring the engine under `E2E_TEST_MODE`.
- `packages/db/src/schema.ts` — `broadcasts`, `broadcast_targets`, `notification_deliveries` tables and all enums.

**Purpose:** This is the engine behind the camp's notification system. A *broadcast* is a composed message (one `broadcasts` row) authored by a sender to an audience. It starts as a draft (`publishedAt IS NULL`), then **fan-out** materialises one **delivery** (`notification_deliveries` row) per recipient — copying title/body/channel/presentation onto each so the inbox and acknowledge gate are self-contained. Camp-wide announcements fan out **inline at publish**; deferred/scoped broadcasts are drained by a **scheduled dispatch cron**. The recipient side exposes per-user **inbox** (newest-first), an **unread count** (drives the bell badge), **mark-read**, **pending full-screen acknowledgements**, and **acknowledge** (dismiss). Presentation variants — `acknowledge` (full-screen takeover gate), `popup`, `feed` — decide how each delivery interrupts the recipient. Dedup is enforced by a partial unique index `(broadcast_id, user_id)` plus `ON CONFLICT DO NOTHING` and atomic `dispatched_at` claims, so retries and overlapping cron runs never double-deliver.

## Features

### Facade & backend split (`apps/web/lib/notifications.ts`)
- Defines a `NotificationsBackend` interface (notifications.ts:38-69) implemented twice: `realBackend` delegating to `@camp404/db/broadcasts` (notifications.ts:71-82), and `testBackend` delegating to `testStore` (notifications.ts:84-115).
- `backend()` picks the impl by `isE2ETestMode()` (notifications.ts:117-119); all 10 exported functions route through it.
- Exported surface: `countUnread`, `listInbox`, `markRead`, `getPendingAcknowledgements`, `acknowledgeDelivery`, `listAnnouncements`, `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement` (notifications.ts:121-181).
- Re-exports the types `AnnouncementPresentation`, `AnnouncementSummary`, `InboxItem`, `PendingAcknowledgement`, `PublishResult` (notifications.ts:30-36).
- The rationale comment notes this is the "same real-vs-test backend split `lib/users.ts` uses so the app renders without a database during Playwright runs" (notifications.ts:23-28).

### Audience resolution (`packages/db/src/audience.ts`)
- `computeAudience(broadcast, data, senderId)` (audience.ts:29-64) — PURE, no DB; given scope + membership data returns recipient user-ids.
- Builds a `real` set = members where `!isSystem && !sanitised` (audience.ts:34-36).
- Per-scope id selection (audience.ts:39-61):
  - `everyone` → all real members.
  - `team` → `memberships` filtered to `m.team === broadcast.team`; **if `broadcast.team` is null/unset → empty (nobody)** (audience.ts:43-49).
  - `team_leads` → `memberships` where `isLead` (audience.ts:50-51).
  - `drivers` → `data.driverUserIds` (audience.ts:52-54).
  - `individual` → `data.targetUserIds` (audience.ts:55-57).
  - `default` → `[]` (audience.ts:59-60).
- Final filter (audience.ts:63): de-duplicates via `new Set`, keeps only ids in `real`, and **always excludes the sender** (`id !== senderId`). Implicitly excludes system actors & sanitised accounts via the `real` set.
- `resolveAudience(broadcast, senderId)` in broadcasts.ts:52-94 is the DB half: reads `users` (id, isSystem, sanitised), all `teamMemberships` (userId, team, isLead), `driverProfiles` where `intendsToDrive = true`, and (only when `scope === 'individual'`) `broadcastTargets` for this broadcast id, then calls `computeAudience`. Reads via stateless HTTP driver (`createHttpDb`).

### Draft lifecycle & queries (`packages/db/src/broadcasts.ts`)
- `isOwnedAnnouncementDraft(id, senderId)` (broadcasts.ts:36-44) — shared predicate locking every announcement mutation to: `id` matches AND `senderId` matches author AND `kind = 'announcement'` AND `scope = 'everyone'` AND `publishedAt IS NULL`. Prevents touching non-announcement broadcasts or another sender's draft.
- `listAnnouncements()` (broadcasts.ts:117-149) — captain-facing management list: every `kind = 'announcement'` broadcast (drafts + published), newest first by `createdAt`. Left-joins sender `displayName`; computes `recipientCount` (count of `notification_deliveries` for the broadcast) and `acknowledgedCount` (those with `acknowledged_at IS NOT NULL`) via correlated subqueries; both coalesced to 0.
- `createAnnouncementDraft({senderId, title, body, presentation})` (broadcasts.ts:159-175) — inserts a `broadcasts` row with `kind='announcement'`, `scope='everyone'`, returns `{ id }`.
- `updateAnnouncementDraft({id, senderId, title, body, presentation})` (broadcasts.ts:181-199) — updates title/body/presentation where `isOwnedAnnouncementDraft`; returns `true` iff a row matched (no-op `false` if missing/published/not-author).
- `deleteAnnouncementDraft({id, senderId})` (broadcasts.ts:202-212) — deletes where `isOwnedAnnouncementDraft`; returns `true` iff a row matched.
- `publishAnnouncement({id, senderId})` (broadcasts.ts:228-290) — **inline publish + fan-out**, in one pooled transaction (`createPooledDb`, closes pool in `finally`):
  1. Claim: `UPDATE broadcasts SET publishedAt=now, dispatchedAt=now WHERE isOwnedAnnouncementDraft` returning id/title/body/channel/presentation. If no row → `{ ok:false, error:"Draft not found, already published, or not yours." }` (broadcasts.ts:248-254).
  2. `resolveAudience({id, scope:'everyone', team:null}, senderId)`. If `recipientIds.length === 0` → returns `{ ok:true, recipientCount:0 }` early **without inserting** (broadcasts.ts:265-267).
  3. Bulk-insert one `notificationDeliveries` row per recipient copying `title`, `body`, `channel`, `presentation`, with `refType:"announcement"`, `refId: broadcast.id`, `.onConflictDoNothing()` (broadcasts.ts:269-283).
  4. Returns `{ ok:true, recipientCount: recipientIds.length }`. **Idempotent on draft→published** (claim only flips an unpublished row, so double-submit can't double-fan-out).
- `dispatchDueBroadcasts(now = new Date())` (broadcasts.ts:306-386) — **scheduled fan-out worker**. Selects broadcasts where `publishedAt IS NOT NULL AND dispatchedAt IS NULL AND (sendAt IS NULL OR sendAt <= now)` (broadcasts.ts:324-333). If none → `{ dispatched:0, deliveries:0 }`. For each due broadcast: resolves audience for **its own scope/team**, then in a transaction atomically claims it (`UPDATE … SET dispatchedAt=now WHERE id=? AND dispatchedAt IS NULL` returning id; if already claimed by another run → `false`, skip), then inserts deliveries copying title/body/channel/presentation, `refType: b.refType ?? null`, `refId: b.refId ?? b.id`, with `.onConflictDoNothing()`. Tallies `dispatched`/`deliveries`. Pool closed in `finally`. Note: deliveries are only inserted when `recipientIds.length > 0` (broadcasts.ts:358).

### Recipient-side reads & writes (`packages/db/src/broadcasts.ts`)
- `getPendingAcknowledgements(userId)` (broadcasts.ts:403-430) — a user's outstanding full-screen acknowledgements: deliveries where `userId = ? AND presentation = 'acknowledge' AND acknowledgedAt IS NULL`, **oldest first** (`orderBy(createdAt)` ascending) so the gate clears them in arrival order. Left-joins broadcast→sender to surface `senderName`. Returns `{ deliveryId, title, body, senderName, createdAt }`.
- `acknowledgeDelivery({deliveryId, userId})` (broadcasts.ts:437-458) — sets `acknowledgedAt=now, readAt=now` (acknowledging implicitly reads) where `id = ? AND userId = ? AND presentation = 'acknowledge' AND acknowledgedAt IS NULL`. Returns `true` iff a row matched. **Owner-scoped** (a user can only dismiss their own) and **acknowledge-variant-only** (never stamps a popup/feed delivery).
- `listInbox(userId)` (broadcasts.ts:472-493) — every delivery for the user, newest first (`desc(createdAt)`); left-joins broadcast→sender for `senderName`. Returns `{ id, title, body, presentation, senderName, readAt, acknowledgedAt, createdAt }`.
- `countUnread(userId)` (broadcasts.ts:496-508) — `count(*)::int` of deliveries where `userId = ? AND readAt IS NULL`; coalesced to 0. Drives the header bell badge.
- `markRead(userId, ids)` (broadcasts.ts:516-529) — sets `readAt=now` where `userId = ? AND id IN ids AND readAt IS NULL`. **Empty `ids` is a no-op** (early return). Caller must pass the exact ids it snapshotted so a delivery arriving after the snapshot stays unread.

### API routes
- `GET /api/notifications/pending` (pending/route.ts:14-28) — `runtime="nodejs"`, `dynamic="force-dynamic"`. Returns `{ pending: PendingAcknowledgement[] }`. Unauthenticated → `{ pending: [] }` (NOT a 401 — the gate mounts app-wide incl. public landing). No camp access (synthetic empty id) → `{ pending: [] }` (querying empty id would 500 on a real DB). Otherwise returns `getPendingAcknowledgements(campUser.id)`.
- `POST /api/notifications/acknowledge` (acknowledge/route.ts:15-36) — `runtime="nodejs"`. Body validated by zod `{ deliveryId: z.string().uuid() }`. Unauthenticated → `401 { error:"unauthorized" }`. Invalid body → `400 { error:"invalid" }`. No camp access → `{ ok:false }`. Otherwise calls `acknowledgeDelivery` and returns `{ ok }` (boolean).
- `GET /api/cron/notifications/dispatch` (dispatch/route.ts:13-18) — `runtime="nodejs"`. `assertCron(req)` guard (constant-time `Bearer ${CRON_SECRET}` check; fails closed when secret unset → 401). On pass, runs `dispatchDueBroadcasts()` → `{ ok:true, dispatched, deliveries }`.

### Captain composer actions (`apps/web/app/captains/announcements/actions.ts`)
- All four actions (`saveDraftAction`, `updateDraftAction`, `deleteDraftAction`, `publishAction`) gate via `requireCaptain()` (actions.ts:23-40), which fails with: `"Not signed in."` (no auth), `"Your account isn't camp-active yet."` (no camp access), `"Your account is still awaiting approval."` (not `isApproved`), `"Captain access only."` (`rank !== 'captain'`). On success returns `{ captainId }`.
- `saveDraftAction` / `updateDraftAction` parse input via `ComposeAnnouncementInput.safeParse`; on failure return `{ ok:false, error: issues[0]?.message ?? "Invalid." }` (actions.ts:49-52, 70-73).
- `updateDraftAction` / `deleteDraftAction` surface `"Draft not found or already published."` when the underlying write returns `false`.
- `publishAction` passes through the data-layer `PublishResult` error verbatim; on success returns `{ ok:true, data:{ recipientCount } }`. All four `revalidatePath("/captains/announcements")` on success.

## User actions & interactions

- **Compose / save draft** (captain) → `saveDraftAction`.
- **Edit draft** (captain, author-only, draft-only) → `updateDraftAction`.
- **Delete draft** (captain, author-only, draft-only) → `deleteDraftAction`.
- **Publish announcement** (captain) → `publishAction` → inline fan-out to whole camp; returns recipient count.
- **Acknowledge a full-screen notification** (any member) → AcknowledgementGate "Acknowledge" button at the end-of-scroll → `POST /api/notifications/acknowledge`. The gate then drops the item and advances to the next; `router.refresh()` updates the bell badge/inbox (acknowledgement-gate.tsx:85-103).
- **Open inbox / read notifications** (any member) → `/notifications` page lists inbox then immediately marks the snapshotted ids read (clears the badge) (notifications/page.tsx:33-37).
- **Tap header bell** → navigates to `/notifications`; badge shows unread count (`99+` cap when > 99) (home-header.tsx:27-46).
- **Poll for pending acknowledgements** (automatic) → gate calls `GET /api/notifications/pending` on mount, every 45s, and on tab focus/visibility (acknowledgement-gate.tsx:54-67).
- **Cron dispatch** (system) → `GET /api/cron/notifications/dispatch` drains deferred/scheduled broadcasts.

## States & presentations

**Presentation variants** (`broadcast_presentation`, schema.ts:166-170; mirrored types/announcement.ts:8-12) — copied onto each delivery at fan-out:
- `acknowledge` — full-screen scrollable takeover the recipient must explicitly acknowledge to dismiss (T&C pattern); used for camp-wide must-see announcements. Only this variant appears in the pending queue and accepts `acknowledgeDelivery`. Inbox icon: `Megaphone`.
- `popup` — transient dismissable pop-up, no acknowledgement required. Inbox icon: `MessageSquare`.
- `feed` — silent; lands in the inbox behind the header bell only. Inbox icon: `Bell`. **Schema default** for both `broadcasts.presentation` and `notification_deliveries.presentation`.

**Delivery read/ack states** (per `notification_deliveries` row):
- Unread: `readAt IS NULL` (counts toward bell badge; inbox row shown with "New" pill + highlighted border).
- Read: `readAt` set (set on inbox open, or implicitly on acknowledge).
- Acknowledged: `acknowledgedAt` set (acknowledge variant only) — inbox footer "· acknowledged"; unacknowledged acknowledge-deliveries show "· awaiting acknowledgement" (notifications/page.tsx:93-98).

**Broadcast lifecycle states:** draft (`publishedAt IS NULL`) → published (`publishedAt` set) → dispatched (`dispatchedAt` set; for inline-published camp announcements both are stamped together).

**Global-states rows that apply here:**
- **Empty** — inbox: "No notifications yet." (notifications/page.tsx:54). Pending queue empty → gate `return null` (renders nothing). `dispatchDueBroadcasts` none-due → `{dispatched:0,deliveries:0}`. `recipientCount:0` for a publish that resolves to nobody.
- **Loading** — acknowledge button shows `Loader2` spinner while `acking` (acknowledgement-gate.tsx:150).
- **Populated** — inbox list; pending queue surfaces the oldest item; bell badge shows count.
- **Validation-error** — compose: zod messages "Give it a title.", "Write the announcement."; acknowledge route: `400 { error:"invalid" }` for non-UUID `deliveryId`.
- **Submitting/pending** — `acking` disables the Acknowledge button (acknowledgement-gate.tsx:148); broadcast `published but not dispatched` is the deferred-pending state the cron drains.
- **Success** — `{ok:true, recipientCount}` / `{ok:true}`; gate advances to next item then refreshes.
- **Disabled** — Acknowledge button `disabled={acking}`.
- **Invite-gated / no-camp-access** — pending & acknowledge routes short-circuit to `{pending:[]}` / `{ok:false}` (never query a synthetic empty id); inbox page `redirect("/signup/required")` when `!hasCampAccess` (notifications/page.tsx:27-29).
- **Pending-approval / Rejected** — composer actions block with `"Your account is still awaiting approval."` (captain still held behind vetting cannot publish).
- **Captain-only-locked** — all four composer actions require `rank === 'captain'` else `"Captain access only."`. The data-layer comment (broadcasts.ts:26-27) stresses captain-facing writers MUST be gated by callers; the module trusts the `senderId` it is handed.

## Enums, options & configurable values

- `broadcast_kind` (schema.ts:128-134): `announcement` | `team_message` | `lead_directive` | `reminder` | `system`. This engine's announcement writers hard-lock to `announcement`.
- `broadcast_scope` (schema.ts:136-142, mirrored audience.ts:6-11): `everyone` | `team` | `team_leads` | `drivers` | `individual`. Announcement path hard-locks to `everyone`.
- `notification_channel` (schema.ts:144-148): `push` | `in_app` | `both`. `broadcasts.channel` default `both`.
- `push_delivery_status` (schema.ts:150-155): `queued` | `sent` | `failed` | `skipped`. `notification_deliveries.pushStatus` default `queued`.
- `broadcast_presentation` (schema.ts:166-170): `acknowledge` | `popup` | `feed`. Default `feed` (schema), but `ComposeAnnouncementInput.presentation` zod default is `acknowledge` (types/announcement.ts:26).
- `POLL_INTERVAL_MS = 45_000` (acknowledgement-gate.tsx:26) — pending poll cadence (45s).
- Bell badge cap: `> 99 ? "99+" : count` (home-header.tsx:41); falsy count hides the badge.
- `ComposeAnnouncementInput` (types/announcement.ts:23-27): `title` trimmed, min 1 ("Give it a title."), max 120; `body` trimmed, min 1 ("Write the announcement."), max 5000; `presentation` enum default `acknowledge`.
- `dispatchDueBroadcasts(now = new Date())` default arg.
- Cron auth: `Bearer ${CRON_SECRET}` constant-time compare; fails closed when `CRON_SECRET` unset (cron-auth.ts:12-22).

## Data model touched

**`broadcasts`** (schema.ts:763-807):
- `id` uuid PK (defaultRandom); `senderId` uuid → `users.id` (onDelete: set null, nullable); `kind` `broadcast_kind` notNull; `scope` `broadcast_scope` notNull; `team` `teamEnum` (set only when scope='team'); `title` text notNull; `body` text notNull; `channel` `notification_channel` notNull default `both`; `presentation` `broadcast_presentation` notNull default `feed`; `refType` text (deep-link target type); `refId` uuid; `publishedAt` timestamp (NULL while draft); `dispatchedAt` timestamp (NULL until fan-out done); `sendAt` timestamp (NULL/<=now = immediate, future = deferred to cron); `createdAt` timestamp notNull defaultNow.
- Indexes: `broadcasts_sender_idx` (senderId), `broadcasts_created_at_idx` (createdAt).

**`broadcast_targets`** (schema.ts:810-823) — explicit recipients for `scope='individual'`:
- `broadcastId` uuid notNull → `broadcasts.id` (onDelete cascade); `userId` uuid notNull → `users.id` (onDelete cascade). PK `(broadcastId, userId)`.

**`notification_deliveries`** (schema.ts:830-887) — per-user inbox row:
- `id` uuid PK (defaultRandom); `broadcastId` uuid → `broadcasts.id` (onDelete cascade, **nullable** for system rows); `userId` uuid notNull → `users.id` (onDelete cascade); `title` text notNull; `body` text notNull; `channel` `notification_channel` notNull; `presentation` `broadcast_presentation` notNull default `feed`; `pushStatus` `push_delivery_status` notNull default `queued`; `refType` text; `refId` uuid; `readAt` timestamp; `acknowledgedAt` timestamp (set on explicit acknowledge of `acknowledge` variant); `deliveredAt` timestamp; `createdAt` timestamp notNull defaultNow.
- Indexes: `notification_deliveries_user_read_idx` (userId, readAt); `notification_deliveries_user_ack_idx` (userId, acknowledgedAt); `notification_deliveries_broadcast_idx` (broadcastId); **partial unique** `notification_deliveries_broadcast_user_uniq` on (broadcastId, userId) `WHERE broadcast_id IS NOT NULL` — the dedupe index enabling `ON CONFLICT DO NOTHING` (system rows with null broadcastId exempt).

**Read-only joins / sources:** `users` (id, isSystem, sanitised, displayName); `teamMemberships` (userId, team, isLead); `driverProfiles` (userId where intendsToDrive=true). `push_tokens` (schema.ts:734-753) referenced by the push worker (out of scope here).

**Interfaces (data layer):** `AnnouncementSummary` (broadcasts.ts:96-110: id, title, body, presentation, senderId, senderName, publishedAt, createdAt, recipientCount, acknowledgedCount); `DraftInput` (broadcasts.ts:151-156); `PublishResult` = `{ok:true, recipientCount}` | `{ok:false, error}` (broadcasts.ts:214-216); `DispatchResult` = `{dispatched, deliveries}` (broadcasts.ts:292-295); `PendingAcknowledgement` (broadcasts.ts:390-396: deliveryId, title, body, senderName, createdAt); `InboxItem` (broadcasts.ts:460-469: id, title, body, presentation, senderName, readAt, acknowledgedAt, createdAt).

## Validation, edge cases & business rules

- **Author-private drafts:** every announcement mutation requires `isOwnedAnnouncementDraft` (id + senderId + kind='announcement' + scope='everyone' + publishedAt IS NULL). Editing/deleting/publishing another sender's draft or a published row is a silent no-op (`false` / error string), never an exception.
- **Publish idempotency:** the claim only flips an unpublished owned row, so double-submit can't double-fan-out; `ON CONFLICT DO NOTHING` + the partial unique index make the delivery insert idempotent even on retry.
- **Cron idempotency:** `dispatchDueBroadcasts` atomically claims each broadcast by flipping `dispatchedAt` inside a transaction (`WHERE dispatched_at IS NULL`); a second concurrent run gets no claimed row and skips. Same dedupe index guards the insert.
- **Sender is always excluded** from the audience (`id !== senderId`, audience.ts:63), as are system actors (`isSystem`) and sanitised accounts (`sanitised`).
- **Team-scoped with no team set → nobody** (audience.ts:43-49); caller MUST set the team.
- **Empty audience** → publish returns `{ok:true, recipientCount:0}` with no inserts; cron skips the insert when no recipients.
- **acknowledgeDelivery is variant- and owner-scoped:** only `presentation='acknowledge'` deliveries the caller owns and that are still unacknowledged can be stamped; never marks a popup/feed delivery acknowledged.
- **markRead snapshot rule:** mark exactly the snapshotted ids and only those still `readAt IS NULL`, so a delivery that arrives between snapshot and write isn't silently marked read; empty list is a no-op.
- **Pending order:** oldest-first (gate clears in arrival order); inbox & announcements list: newest-first.
- **Auth/access edge in routes:** unauthenticated pending → empty list (not 401, since the gate mounts on public pages); no-camp-access synthetic empty id is never used in a query (would 500 on a real DB) — returns empty/`{ok:false}`.
- **Acknowledge route validation:** `deliveryId` must be a UUID (zod), else 400; unauthenticated → 401.
- **Cron auth fails closed:** unset/empty `CRON_SECRET` authorizes nobody; constant-time, length-guarded compare.
- **Acknowledge gate concurrency:** a monotonic `requestIdRef` token drops superseded poll responses; after a successful acknowledge it bumps the token so an in-flight poll can't re-add the dismissed item (acknowledgement-gate.tsx:35,45,94-95).
- **Gate scroll lock:** body `overflow:hidden` while a notification is showing; scroll resets to top per new item; restores prior overflow on unmount (acknowledgement-gate.tsx:73-81).
- **`refType`/`refId` deep-link:** publish hard-codes `refType:"announcement"`, `refId: broadcast.id`; dispatch copies `b.refType ?? null` / `b.refId ?? b.id`. <!-- low-confidence: no UI handler currently reads delivery.refType to open a bespoke deep-link target; only the schema comment (schema.ts:787-789) and announcement composer link reference it. The wiring appears intended but not yet built. -->

## Sub-components / variants

- **`@camp404/db/broadcasts` writers (real backend):** `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement` (inline fan-out), `dispatchDueBroadcasts` (scheduled fan-out). Readers: `listAnnouncements`, `getPendingAcknowledgements`, `listInbox`, `countUnread`. State writes: `acknowledgeDelivery`, `markRead`.
- **`computeAudience` / `resolveAudience`** — the pure resolver + its DB-fetching wrapper; shared by the inline publish and the cron dispatch.
- **Validators/handlers:** `ComposeAnnouncementInput` + `AnnouncementPresentation` (zod); `Body` (`{deliveryId: uuid}`) in the acknowledge route; `assertCron`/`isAuthorizedCron` in cron-auth.
- **In-memory test backend (`testStore`)** mirrors the engine for `E2E_TEST_MODE`. **Divergences from the real backend (ugly truths):**
  - `publishBroadcast` (test-store.ts:404-438) fans out to **all users except the sender** with **no system/sanitised/real-set filtering** and **no scope handling** (it has no scope field at all — `TestBroadcast` lacks scope/team/channel/refType/dispatchedAt/sendAt; test-store.ts:64-72). It ignores `presentation` filtering for recipients (every recipient gets the broadcast's presentation copied).
  - There is **no `dispatchDueBroadcasts` equivalent** in the test store — only the inline publish path is modelled.
  - `TestDelivery` (test-store.ts:74-84) lacks `channel`, `pushStatus`, `refType`, `refId`, `deliveredAt` — only the inbox/ack-relevant fields are kept.
  - `acknowledgeDelivery` / `getPendingAcknowledgements` / `countUnread` / `markRead` / `listInbox` otherwise match the real semantics (variant/owner scoping, ordering, unread filter).
  - `reset()` clears `broadcasts` and `deliveries` arrays between tests (test-store.ts:558-567).
- **Dead/unused-here:** `broadcast_kind` values `team_message`, `lead_directive`, `reminder`, `system` and scopes `team`/`team_leads`/`drivers`/`individual` are defined in the engine (audience resolves them) but the only compose path wired in this codebase is the camp-wide `announcement`/`everyone` subset (per the `ComposeAnnouncementInput` comment, types/announcement.ts:18-22: scoped & scheduled compose inputs "land with the gating + push UIs"). `push`/`in_app` channel values and the entire `push_delivery_status` enum are carried on rows but not exercised by this inbox/gate engine (push worker is a separate unit).
