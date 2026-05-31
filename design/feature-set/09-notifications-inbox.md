# 09 — Notifications inbox

**Files covered:**
- `apps/web/app/notifications/page.tsx` — the member-facing inbox screen (RSC, `force-dynamic`); auth + invite gate, snapshot-then-mark-read, renders the delivery list newest-first with per-row presentation icons.
- `apps/web/lib/notifications.ts` — server-only facade that routes inbox reads/writes (`listInbox`, `markRead`, `countUnread`) plus the ack/announcement APIs through either the Neon-backed `@camp404/db/broadcasts` or the in-memory `testStore` under `E2E_TEST_MODE`.
- `packages/db/src/broadcasts.ts` — the real data layer: `listInbox`, `markRead`, `countUnread` queries + `InboxItem` interface (recipient-side reads against `notification_deliveries`).
- `apps/web/lib/test-store.ts` — in-memory `listInbox`/`markRead`/`countUnread` for `E2E_TEST_MODE`.
- `apps/web/app/home-header.tsx` — the header bell + unread badge that links to `/notifications` (entry point into this surface).
- `apps/web/app/page.tsx` — home page; computes `countUnread(campUser.id)` and feeds the badge count into `HomeHeader` (`page.tsx:68`, `:91`).
- `packages/db/src/schema.ts` — `notification_deliveries` table, `broadcasts` table, and the `broadcast_presentation` enum the inbox reads.
- `apps/web/lib/users.ts` — `hasCampAccess` (`:219`) invite gate used by the page.

**Purpose:** The notifications inbox is the member-facing list of every notification delivered to the signed-in camp member, shown newest-first behind the header bell. It is a read-only review surface: opening it snapshots the current deliveries, displays each with a presentation-derived icon, sender attribution, body, and date, flags rows that were still unread on arrival as "New", and then marks exactly that snapshot as **read** (clearing the unread badge). Reading here is deliberately distinct from **acknowledging** — the full-screen acknowledgement takeover (unit 25) is the only place a `presentation = 'acknowledge'` delivery's `acknowledgedAt` gets stamped; this inbox only stamps `readAt`. The delivery/fan-out engine that creates the rows is unit 27.

## Features

### Notifications page (`apps/web/app/notifications/page.tsx`)
- **RSC, force-dynamic** (`page.tsx:8`): `export const dynamic = "force-dynamic"` so the inbox is never statically cached and always reflects current deliveries.
- **Page metadata** (`page.tsx:10`): `metadata = { title: "Notifications — Camp 404" }`.
- **Auth + invite gate** (`page.tsx:25-29`): `getAuthenticatedUserOrRedirect()` (redirects unauthenticated users via auth lib), then `ensureCampUser(authUser)`, then `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")`. NOTE — this surface does **not** re-run the onboarding/approval/rejected gates from the home spine (`app/page.tsx:44-63`); only auth + invite-access are enforced here.
- **Snapshot-then-mark-read** (`page.tsx:31-37`): `const items = await listInbox(campUser.id)` snapshots the inbox (with each row's pre-read `readAt`), then `await markRead(campUser.id, items.map((i) => i.id))` clears the unread flag for exactly those snapshotted ids. A delivery that arrives *after* the snapshot stays unread (it is neither shown nor marked) — by design (`page.tsx:31-32`, `broadcasts.ts:510-516`).
- **Back-to-home link** (`page.tsx:41-45`): ghost `Button` (`size="sm"`) wrapping `<a href="/">` with a `ChevronLeft` icon and label "Home".
- **Header block** (`page.tsx:46-51`): `<h1>` "Notifications"; subtitle paragraph "Everything that's been sent your way."
- **Empty state** (`page.tsx:53-54`): when `items.length === 0`, renders a single muted paragraph "No notifications yet."
- **Delivery list** (`page.tsx:56-103`): `<ul>` of `<li>` rows, one per `InboxItem`, in the order returned by `listInbox` (newest-first — see below). Each row shows: presentation icon, title, optional "New" pill, date (`createdAt`), body (whitespace-preserving), and an optional "From {senderName}" attribution line with acknowledgement status suffix.
- **Per-row presentation icon** (`page.tsx:18-22`, `:72`): `presentationIcon(item.presentation)` → `Megaphone` for `"acknowledge"`, `MessageSquare` for `"popup"`, else (`"feed"`) `Bell`. All rendered `h-4 w-4`, `aria-hidden`, inside a `text-muted-foreground` span.
- **"New" flagging** (`page.tsx:58`, `:64-66`, `:77-81`): `const isNew = item.readAt === null` (i.e. it was unread at snapshot time). New rows get an emphasised border/background (`border-[color:var(--color-primary)]/40 bg-accent/20`) and a pill reading "New" (`bg primary` / `text primary-foreground`, `text-[10px]`).
- **Date display** (`page.tsx:83-85`): `<time>` showing `new Date(item.createdAt).toLocaleDateString()` (date only, locale-formatted, no time component).
- **Body display** (`page.tsx:87-89`): `whitespace-pre-wrap` muted paragraph rendering `item.body` verbatim (newlines preserved). No markdown rendering.
- **Sender + acknowledgement attribution** (`page.tsx:90-99`): only rendered when `item.senderName` is truthy. Shows "From {senderName}" plus a suffix: `" · acknowledged"` if `item.acknowledgedAt` is set; else `" · awaiting acknowledgement"` if `item.presentation === "acknowledge"`; else empty string. So a `feed`/`popup` delivery shows just "From {senderName}" with no status; an `acknowledge` delivery shows its ack state. System deliveries with no `senderName` show no attribution line at all.

### Header bell entry point (`apps/web/app/home-header.tsx`)
- **Bell link** (`home-header.tsx:26-44`): `next/link` to `/notifications`, `Bell` icon (`h-5 w-5`). `aria-label` is `"Notifications (${notifications} unread)"` when `notifications` is truthy, else `"Notifications"`.
- **Unread badge** (`home-header.tsx:36-43`): rendered only when `notifications` is truthy. Pill with `bg primary` / `text primary-foreground`, `text-[10px]`, positioned top-right of the bell; displays `notifications > 99 ? "99+" : notifications`. The prop is documented "Falsy hides the badge." (`home-header.tsx:13`).
- **Badge source** (`page.tsx:68`, `:80`, `:91`): the home page computes `countUnread(campUser.id)` and passes it as `notifications`. `countUnread` counts deliveries with `readAt IS NULL` (`broadcasts.ts:496-508`).

### Facade routing (`apps/web/lib/notifications.ts`)
- **Real-vs-test backend split** (`notifications.ts:71-119`): `backend()` returns `testBackend` when `isE2ETestMode()` else `realBackend`. App code (pages, actions, route handlers) imports the wrapper functions from this module, never `@camp404/db/broadcasts` directly (`notifications.ts:24-28`).
- **Inbox-relevant exports**: `countUnread(userId)` (`:121-123`), `listInbox(userId)` (`:125-127`), `markRead(userId, ids)` (`:129-131`). (Also re-exports `getPendingAcknowledgements`, `acknowledgeDelivery` for unit 25, and the captain announcement CRUD/publish for unit 27 — out of scope here.)

### Inbox queries (`packages/db/src/broadcasts.ts`)
- **`listInbox(userId)`** (`broadcasts.ts:472-493`): selects from `notification_deliveries` filtered to `userId`, `LEFT JOIN broadcasts` then `LEFT JOIN users` on the broadcast's `senderId`, ordered `desc(createdAt)` (newest first). Returns the delivery's own `id`, `title`, `body`, `presentation`, `readAt`, `acknowledgedAt`, `createdAt`, plus `senderName = users.displayName` (NULL if no broadcast / no sender / system delivery). Uses the stateless HTTP driver.
- **`markRead(userId, ids)`** (`broadcasts.ts:516-529`): no-op when `ids.length === 0`. Otherwise updates `notification_deliveries.readAt = new Date()` where `userId` matches AND `id IN ids` AND `readAt IS NULL` (only stamps rows still unread — never re-stamps an already-read row, and never touches another user's rows). Returns `void`.
- **`countUnread(userId)`** (`broadcasts.ts:496-508`): `count(*)::int` of the user's deliveries with `readAt IS NULL`; returns `0` when no row. Drives the header bell badge.

### Test-mode inbox (`apps/web/lib/test-store.ts`)
- **`listInbox(userId)`** (`test-store.ts:514-542`): filters `deliveries` by `userId`, sorts `b.createdAt - a.createdAt` (newest first), maps to `{ id, title, body, presentation, senderName, readAt, acknowledgedAt, createdAt }`. `senderName` resolved from the parent broadcast's sender's `displayName` (NULL if no sender / system).
- **`countUnread(userId)`** (`test-store.ts:543-546`): `deliveries.filter(d => d.userId === userId && d.readAt === null).length`.
- **`markRead(userId, ids)`** (`test-store.ts:547-556`): no-op on empty `ids`; otherwise sets `d.readAt = now` for each delivery whose `userId` matches, `readAt === null`, and whose `id` is in the id set. Mirrors the real query's "only-if-still-unread, owner-scoped" semantics.

## User actions & interactions
- **Open the inbox**: tap the header bell (`HomeHeader` → `/notifications`). The act of opening is itself the read action — there is no per-row "mark read" button. On render the page marks the entire snapshot read.
- **Navigate back home**: tap the "Home" ghost button (`<a href="/">`) — the only navigational control on the page.
- **Read a notification**: visually scan each row (icon + title + body + date + sender). There are NO interactive per-row controls — no delete, archive, mute, dismiss, mark-unread, expand/collapse, or deep-link/open action on a row. Rows are static `<li>`s.
- **Implicit badge clear**: returning to home after opening the inbox shows a cleared (or reduced) bell badge, because the snapshot's rows are now `readAt`-stamped and `countUnread` drops.
- **NOT here — acknowledging**: opening the inbox never stamps `acknowledgedAt`; an `acknowledge` delivery still shows "· awaiting acknowledgement" until the user clears it via the separate full-screen `AcknowledgementGate` (unit 25). `acknowledgeDelivery` is exported by the facade but not invoked by this page.

## States & presentations
Global-states rows that apply to this surface:
- **Empty** (`page.tsx:53-54`): `items.length === 0` → "No notifications yet." muted paragraph. The header bell shows no badge (`countUnread` = 0).
- **Loading**: server-rendered (`force-dynamic`); no explicit client loading/skeleton state — the page awaits `listInbox` + `markRead` before responding. No client-side spinner.
- **Populated** (`page.tsx:56-103`): the `<ul>` of delivery rows. Two visual sub-variants per row: **unread-on-arrival** (`isNew` → emphasised border/bg + "New" pill) and **already-read** (plain border).
- **Validation-error**: N/A — this is a read-only list; no form, no input, no submit, hence no validation-error surface.
- **Submitting/pending**: the one write (`markRead`) is a fire-then-render side effect awaited server-side before the HTML is returned; there is no in-page submitting/pending indicator.
- **Success**: implicit — the rendered list with the badge cleared is the success state; no toast/confirmation.
- **Disabled**: N/A — no actionable controls to disable (other than the always-enabled Home/back link).
- **Invite-gated** (`page.tsx:27-29`): `!hasCampAccess(campUser, primaryEmail)` → `redirect("/signup/required")`. God emails (`isGodEmail`) or any user with a redeemed `inviteCode` pass (`users.ts:219-224`).
- **Onboarding-incomplete / Pending-approval / Rejected**: NOT enforced on this page (unlike the home spine). A user who is onboarding-incomplete, pending, or rejected but who is past the invite gate would still see their inbox — the page only checks auth + camp access. `<!-- low-confidence: this is an observed asymmetry vs app/page.tsx:44-63; the inbox intentionally only gates on auth+invite, so these gating rows do not block this surface even though they block home. -->`
- **Captain-only-locked**: N/A — the inbox is member-facing; every camp member (any rank) sees their own deliveries. There is no rank gate and no captain-only content on this surface.
- **Per-row "New" presentation** (`page.tsx:77-81`): the "New" pill + emphasised styling appears for any row that was `readAt === null` at snapshot time, regardless of presentation variant.
- **Acknowledgement-status presentation** (`page.tsx:93-97`): three states surfaced inline on the attribution line — acknowledged (`acknowledgedAt` set → "· acknowledged"), awaiting (presentation `acknowledge` + not acknowledged → "· awaiting acknowledgement"), or none (feed/popup → no suffix).

## Enums, options & configurable values
- **`broadcast_presentation`** (`schema.ts:166-170`): `["acknowledge", "popup", "feed"]`. This is the enum the inbox reads via `item.presentation`; default at the column level is `"feed"` (`schema.ts:783-785`, `:846-848`). Icon mapping (`page.tsx:18-22`): `acknowledge`→`Megaphone`, `popup`→`MessageSquare`, `feed`/fallback→`Bell`.
- **`notification_channel`** (`schema.ts:144-148`): `["push", "in_app", "both"]`, column default `"both"` on `broadcasts` / required on deliveries. Carried on the delivery row but NOT read or displayed by the inbox UI.
- **`broadcast_kind`** (`schema.ts:128-134`): `["announcement", "team_message", "lead_directive", "reminder", "system"]` — on `broadcasts`, not surfaced in the inbox row (the inbox shows the delivery copy, not the broadcast kind).
- **`broadcast_scope`** (`schema.ts:136-142`): `["everyone", "team", "team_leads", "drivers", "individual"]` — broadcast-side audience selector; not read by the inbox.
- **`push_delivery_status`** (`schema.ts:150-155`): `["queued", "sent", "failed", "skipped"]` — on the delivery row (`pushStatus`, default `"queued"`); not surfaced in the inbox.
- **Badge cap** (`home-header.tsx:41`): unread counts above 99 render as the literal string `"99+"`.
- **Date format** (`page.tsx:84`): `toLocaleDateString()` — locale-dependent date-only string; no configurable format.
- **Layout width** (`page.tsx:40`): `max-w-2xl` container (note: wider than the global mobile `max-w-lg`; this page uses `max-w-2xl px-6 py-10`). `<!-- low-confidence: this max-w-2xl deviates from the product-wide max-w-lg shell; captured as-is, not a guess. -->`

## Data model touched
Read/written by this surface (must agree with unit 29):

- **`notification_deliveries`** (`schema.ts:830-887`) — the per-user inbox row; the inbox's primary table:
  - `id` uuid PK (`defaultRandom`) — shown as the row key and the id passed to `markRead`.
  - `broadcastId` uuid → `broadcasts.id` `onDelete: cascade`, **nullable** (system deliveries have NULL).
  - `userId` uuid → `users.id` `onDelete: cascade`, NOT NULL — the recipient; the inbox filters on this.
  - `title` text NOT NULL — self-contained copy from the broadcast; shown as the row heading.
  - `body` text NOT NULL — self-contained copy; shown as the row body.
  - `channel` `notification_channel` NOT NULL — copied at fan-out; not displayed.
  - `presentation` `broadcast_presentation` NOT NULL default `"feed"` — drives the row icon and ack-status suffix.
  - `pushStatus` `push_delivery_status` NOT NULL default `"queued"` — not read by the inbox.
  - `refType` text (nullable), `refId` uuid (nullable) — deep-link target; not read/used by the inbox UI.
  - `readAt` timestamp (nullable) — NULL ⇒ unread; `markRead` stamps it; `isNew` reads it; `countUnread` filters on `IS NULL`.
  - `acknowledgedAt` timestamp (nullable) — stamped only by the acknowledge gate (unit 25), read by the inbox for the attribution suffix.
  - `deliveredAt` timestamp (nullable) — push-delivery bookkeeping; not read by the inbox.
  - `createdAt` timestamp NOT NULL `defaultNow()` — the sort key (`desc`) and the displayed date.
  - Indexes: `notification_deliveries_user_read_idx (userId, readAt)`; `notification_deliveries_user_ack_idx (userId, acknowledgedAt)`; `notification_deliveries_broadcast_idx (broadcastId)`; partial unique `notification_deliveries_broadcast_user_uniq (broadcastId, userId) WHERE broadcastId IS NOT NULL`.
- **`broadcasts`** (`schema.ts:763-807`) — LEFT JOINed to resolve `senderId`; the inbox reads only the join path to the sender. Fields touched via join: `id` (= `broadcastId`), `senderId` uuid → `users.id` `onDelete: set null` (nullable). (Other broadcast fields — `kind`, `scope`, `team`, `title`, `body`, `channel`, `presentation`, `refType`, `refId`, `publishedAt`, `dispatchedAt`, `sendAt`, `createdAt` — belong to the compose/fan-out engine, unit 27, not this surface.)
- **`users`** (`schema.ts` ~`:223`, `:234`, `:279`) — LEFT JOINed to provide `displayName` (→ `senderName`). The inbox itself only reads `displayName`. The page's gate also reads `users.inviteCode` (via `hasCampAccess`), `users.id`, `users.profileImageUrl`/`displayName` (home page side). `users.isSystem` / `users.sanitised` are read by the fan-out audience resolver (unit 27), not by the inbox read path.
- **`InboxItem` interface** (`broadcasts.ts:460-469`): `{ id: string; title: string; body: string; presentation: AnnouncementPresentation; senderName: string | null; readAt: Date | null; acknowledgedAt: Date | null; createdAt: Date }`. (Note: it carries no `channel`, `refType`, `refId`, `pushStatus`, or `broadcastId` — the inbox UI cannot deep-link.)
- **Test-store mirrors** (`test-store.ts:64-84`): `TestBroadcast { id, senderId, title, body, presentation, publishedAt, createdAt }` and `TestDelivery { id, broadcastId, userId, title, body, presentation, readAt, acknowledgedAt, createdAt }` — `TestPresentation = "acknowledge" | "popup" | "feed"` (`test-store.ts:59`). The test store omits `channel`, `pushStatus`, `refType`, `refId`, `deliveredAt`.

## Validation, edge cases & business rules
- **Read ≠ acknowledge**: opening the inbox stamps `readAt` only, never `acknowledgedAt` (`page.tsx:14-16`, `:33-37`). Acknowledgement is exclusively the full-screen gate's job (`broadcasts.ts:437-458`, unit 25).
- **Snapshot consistency** (`page.tsx:31-37`, `broadcasts.ts:510-516`): `markRead` is passed exactly the ids from the just-rendered `listInbox` snapshot, so a delivery arriving between snapshot and write is neither displayed nor marked read — it correctly stays unread for next time.
- **`markRead` is idempotent & owner-scoped** (`broadcasts.ts:516-529`, `test-store.ts:547-556`): only rows with matching `userId`, id in the list, and `readAt IS NULL` are stamped. An already-read row is never re-stamped (its original read timestamp is preserved); a user cannot mark another user's deliveries read.
- **Empty-list no-op** (`broadcasts.ts:517`, `test-store.ts:548`): `markRead` with `ids.length === 0` returns immediately — an empty inbox issues no UPDATE.
- **`isNew` is point-in-time** (`page.tsx:58`): computed from the *snapshot's* `readAt` (which is null for rows that were unread at load), so the "New" pill reflects unread-on-this-open even though those rows are simultaneously being marked read. On reload the same rows show as read (no pill).
- **Sender fallbacks** (`broadcasts.ts:480`, `:490`, `page.tsx:90`): `senderName` is `users.displayName` via two LEFT JOINs, so it is NULL when the delivery has no `broadcastId` (system notification), the broadcast's `senderId` is NULL (sender deleted → `set null`), or `displayName` is unset. A NULL `senderName` suppresses the entire attribution/ack-status line — meaning an `acknowledge` delivery from a deleted/system sender shows NO "awaiting acknowledgement" hint.
- **Ack-status suffix precedence** (`page.tsx:93-97`): `acknowledgedAt` set wins ("· acknowledged") over presentation; only an unacknowledged `acknowledge` delivery shows "· awaiting acknowledgement"; `feed`/`popup` never show a suffix.
- **Body is plain text** (`page.tsx:87-89`): rendered with `whitespace-pre-wrap`; newlines preserved, no markdown/HTML interpretation, no truncation/clamp.
- **Date-only display** (`page.tsx:84`): `toLocaleDateString()` drops the time; two notifications on the same day are indistinguishable by the visible timestamp (ordering still uses full `createdAt desc`).
- **No pagination / limit** (`broadcasts.ts:472-493`, `test-store.ts:514-542`): `listInbox` returns ALL of the user's deliveries with no LIMIT/offset; the page renders every row. For a long-lived account this list is unbounded. (And every render re-marks the entire snapshot, including already-read rows — harmlessly, since the UPDATE is `readAt IS NULL`-guarded.)
- **Gate asymmetry** (`page.tsx:24-29`): only `getAuthenticatedUserOrRedirect` + invite-access (`hasCampAccess`) gate this page; the onboarding/pending/rejected gates that protect home are NOT applied here.
- **`hasCampAccess` rule** (`users.ts:219-224`): passes if `isGodEmail(email)` OR the user has a non-null `inviteCode`; otherwise the page redirects to `/signup/required`.

## Sub-components / variants
- **`presentationIcon(p)`** (`page.tsx:18-22`): pure mapping helper, `InboxItem["presentation"] → JSX icon`. Three live branches: `acknowledge`→`Megaphone`, `popup`→`MessageSquare`, fallback (`feed`)→`Bell`. No dead branch (the fallback covers `feed`).
- **`HomeHeader`** (`home-header.tsx:23-57`): shared header content (bell + badge + avatar). The bell+badge half is the inbox's entry point; the avatar half links to `/profile` (unrelated). Badge hidden on falsy/zero count; capped at "99+".
- **Row variants** (`page.tsx:60-100`): two CSS-only variants of the same `<li>` — `isNew` (emphasised border `border-primary/40` + `bg-accent/20` + "New" pill) vs read (plain `border`). Not separate components.
- **Backend variants** (`notifications.ts:71-119`): `realBackend` (Neon/Drizzle via `@camp404/db/broadcasts`) vs `testBackend` (in-memory `testStore`), selected per-call by `backend()` on `isE2ETestMode()`. Same `NotificationsBackend` interface (`notifications.ts:38-69`); the inbox-relevant methods are `countUnread`, `listInbox`, `markRead`.
- **No orphaned/dead inbox variants found.** The facade also exports announcement-CRUD/publish and ack-gate methods, but those belong to units 27 (delivery engine / captain compose) and 25 (ack gate) respectively and are not invoked by this inbox surface.
