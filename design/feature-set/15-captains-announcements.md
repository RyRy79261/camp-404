# 15 — Captain announcements / broadcast composer

**Files covered:**
- `apps/web/app/captains/announcements/page.tsx` — server route; gates to captain, loads all announcements, renders the manager shell + intro copy.
- `apps/web/app/captains/announcements/announcements-manager.tsx` — `"use client"` composer + drafts list + published list; all local form state and the four mutation calls.
- `apps/web/app/captains/announcements/actions.ts` — `"use server"` server actions (`saveDraftAction`, `updateDraftAction`, `deleteDraftAction`, `publishAction`) + the `requireCaptain` gate + Zod validation.
- `apps/web/lib/notifications.ts` — `server-only` facade routing every read/write through the real Neon backend or the in-memory `testStore` under `E2E_TEST_MODE`.
- `packages/db/src/broadcasts.ts` — Neon/Drizzle data layer: list, create/update/delete draft, `publishAnnouncement` (transactional fan-out), `resolveAudience`, plus dispatch/recipient queries.
- `packages/db/src/audience.ts` — pure `computeAudience(scope → recipient ids)` resolver shared by inline publish and the cron dispatcher.
- `packages/types/src/announcement.ts` — Zod `AnnouncementPresentation` enum + `ComposeAnnouncementInput` schema (the validation contract).
- `packages/db/src/schema.ts` (broadcast region) — `broadcasts`, `broadcast_targets`, `notification_deliveries` tables + the `broadcast_*` pgEnums.
- `apps/web/lib/test-store.ts` (announcements region) — E2E in-memory mirror of the draft/publish/list operations.

**Purpose:** A captain-only surface to author camp-wide announcements. A captain composes a draft (title, body, presentation variant), saves it (draft = unpublished `broadcasts` row with `kind='announcement'`, `scope='everyone'`), then edits / deletes / publishes it. Publishing fans the message out to every real camp member except the author as one `notification_deliveries` row each, copying title/body/channel/presentation so the recipient inbox and acknowledge gate are self-contained. The same screen lists drafts (editable) and published announcements with delivery roll-ups (recipient count, acknowledged count for the `acknowledge` variant, timestamp, "by you" marker). The actual delivery/push engine is unit 27; this unit stops at the inline fan-out into `notification_deliveries`.

## Features

### Route gate & shell (page.tsx)
- Server component, `export const dynamic = "force-dynamic"` (`page.tsx:9`); `metadata.title = "Announcements — Camp 404"` (`page.tsx:11`).
- Gating spine, in order (`page.tsx:20-30`): `getAuthenticatedUserOrRedirect()` → `ensureCampUser(authUser)` → `!hasCampAccess(...)` redirect `/signup/required` → `!isApproved(...)` redirect `/pending-approval` → `campUser.rank !== "captain"` redirect `/` (home). Explicitly NO locked view here — a non-captain is bounced home, unlike the camp-management roster (`page.tsx:13-17` comment).
- Loads `listAnnouncements()` (all announcements, drafts + published, newest first) and passes `announcements` + `currentUserId = campUser.id` to `<AnnouncementsManager>` (`page.tsx:32, 52-55`).
- Back link: ghost `Button` → `/captains/tools`, labelled "Camp tools" with `ChevronLeft` icon (`page.tsx:36-40`).
- Header: H1 "Announcements & notifications"; muted lead paragraph: "Compose a message, save it as a draft, then publish it to the whole camp. Everyone but you receives it. A full-screen announcement takes over each member's screen until they acknowledge it." (`page.tsx:42-49`).
- Layout: `<main className="mx-auto max-w-3xl px-6 py-10">` (NOTE: `max-w-3xl`, wider than the global `max-w-lg` convention — captured as an ugly truth) (`page.tsx:35`).

### Composer (announcements-manager.tsx)
- Single section card titled "New announcement" when composing, "Edit draft" when `form.editingId` is set (`announcements-manager.tsx:166-183`).
- "Cancel edit" ghost button (with `X` icon) appears only while editing; calls `reset()` (clears form to `EMPTY_FORM` + clears error) (`:171-182, 94-97`).
- Three fields: **Title** (`Input`, `maxLength={120}`, placeholder "Burn-night briefing"); **Message** (`Textarea`, `maxLength={5000}`, `rows={6}`, placeholder "What does everyone need to know?"); **How it lands** (`Select` over the 3 presentation variants) (`:186-244`).
- Presentation `Select` renders each option as icon + label from `PRESENTATION_META`; a muted hint line below shows `PRESENTATION_META[form.presentation].hint` (`:213-244`).
- Inline error (`role="alert"`, destructive colour) and success notice (`text-emerald-400`) banners; notice hidden when an error is present (`:246-255`).
- Single primary submit button: "Save draft" (new) or "Update draft" (editing); spins a `Loader2` while `pending`, else `Pencil` icon (`:257-271`).

### Drafts list (announcements-manager.tsx)
- Section header "Drafts" + `(count)` only when `drafts.length > 0` (`:277-279`).
- Empty state: "No drafts." (`:280-281`).
- Each draft card: `AnnouncementHeader` (title + presentation pill), full body (`whitespace-pre-wrap`), and three action buttons: **Edit** (ghost, `Pencil`), **Delete** (ghost, destructive text, `Trash2`), **Publish to camp** (primary, `Send`) (`:283-323`).
- Drafts = `announcements.filter(a => a.publishedAt === null)` (`:91`).

### Published list (announcements-manager.tsx)
- Section header "Published" + `(count)` only when `published.length > 0` (`:329-331`).
- Empty state: "Nothing published yet." (`:332-335`).
- Each published card: `AnnouncementHeader`, full body, then a meta footer row (`:339-359`):
  - "Sent to {recipientCount} member(s)" (singular/plural).
  - " · by you" appended when `a.senderId === currentUserId`.
  - For `acknowledge` presentation only: `CheckCircle2` icon + "{acknowledgedCount}/{recipientCount} acknowledged".
  - `new Date(a.publishedAt).toLocaleString()` timestamp.
- Published = `announcements.filter(a => a.publishedAt !== null)` (`:92`); published rows are read-only here (no edit/delete/republish controls).

### AnnouncementHeader sub-component (announcements-manager.tsx)
- Title (`h3`) + a rounded-pill badge with the presentation icon and a short word: `"Acknowledge"` / `"Pop-up"` / `"Inbox"` (`:369-393`). `title` attribute = the presentation's `hint`. NOTE: pill text uses different short words ("Pop-up", "Inbox") than the composer `label` strings.

### Server actions (actions.ts)
- `requireCaptain()` — re-runs the page's gate chain at the data layer (defence in depth): not signed in → "Not signed in."; no camp access → "Your account isn't camp-active yet."; not approved → "Your account is still awaiting approval."; `rank !== "captain"` → "Captain access only."; else returns `{ ok:true, captainId }` (`actions.ts:23-40`).
- `saveDraftAction(input)` — gate → `ComposeAnnouncementInput.safeParse` → `createAnnouncementDraft({ senderId: captainId, ...parsed })` → `revalidatePath("/captains/announcements")` → returns `{ ok:true, data:{ id } }` (`:43-60`).
- `updateDraftAction(id, input)` — gate → parse → `updateAnnouncementDraft` returning bool; `false` → error "Draft not found or already published." → revalidate (`:63-85`).
- `deleteDraftAction(id)` — gate → `deleteAnnouncementDraft`; `false` → "Draft not found or already published." → revalidate (`:88-98`).
- `publishAction(id)` — gate → `publishAnnouncement({ id, senderId: captainId })`; passes through its `{ ok:false, error }`; on success revalidate, returns `{ ok:true, data:{ recipientCount } }` (`:104-114`).
- `ActionResult<T>` discriminated union: `{ ok:true }` (+ `data` when `T` is not `undefined`) | `{ ok:false; error:string }` (`:14-16`).

### Data layer (broadcasts.ts)
- `listAnnouncements()` — selects all `broadcasts` where `kind='announcement'`, left-joins `users` for `senderName` (`users.displayName`), computes `recipientCount` and `acknowledgedCount` via correlated `count(*)::int` subqueries over `notification_deliveries`, ordered `desc(createdAt)`; null counts coalesced to 0 (`:117-149`).
- `createAnnouncementDraft(input)` — inserts a `broadcasts` row with `kind='announcement'`, `scope='everyone'`, given title/body/presentation; returns `{ id }` (`:159-175`).
- `updateAnnouncementDraft(input)` — updates title/body/presentation only where `isOwnedAnnouncementDraft` matches; returns bool (`:181-199`).
- `deleteAnnouncementDraft(input)` — deletes where `isOwnedAnnouncementDraft`; returns bool (`:202-212`).
- `publishAnnouncement(input)` — pooled-DB transaction: claim+stamp draft, resolve audience, bulk-insert deliveries `ON CONFLICT DO NOTHING`; returns `PublishResult` (`:228-290`). Detailed below in §Validation.
- `resolveAudience(broadcast, senderId)` — fetches users/memberships/drivers/(targets for individual scope) and delegates to `computeAudience` (`:52-94`).
- Helper `isOwnedAnnouncementDraft(id, senderId)` — the AND predicate locking every draft mutation to: `id` + `senderId` + `kind='announcement'` + `scope='everyone'` + `publishedAt IS NULL` (`:36-44`).

### Pure audience resolver (audience.ts)
- `computeAudience(broadcast, data, senderId)` — builds `real` set = members where `!isSystem && !sanitised`; per-scope id list; returns de-duped ids filtered to `real.has(id) && id !== senderId` (`audience.ts:29-64`). For this unit the scope is always `everyone` → `ids = [...real]`.

## User actions & interactions

- **Type a title** (≤120 chars enforced client-side via `maxLength`).
- **Type a message body** (≤5000 chars enforced client-side via `maxLength`).
- **Pick a presentation** from the Select: `acknowledge` (default) / `popup` / `feed`.
- **Save draft** — primary button; disabled unless both `form.title.trim()` and `form.body.trim()` are non-empty AND not `pending` (`:261`). On success: notice "Draft saved.", form resets, `router.refresh()`.
- **Update draft** — same button while editing; on success notice "Draft updated.", reset, refresh.
- **Cancel edit** — discards edit, returns composer to new-announcement mode (`:171-182`).
- **Edit a draft** — `handleEdit` loads the draft's id/title/body/presentation into the composer; clears error & notice (`:121-130`).
- **Delete a draft** — `handleDelete`; if it was the one being edited, also `reset()`; notice "Draft deleted."; refresh (`:132-145`).
- **Publish to camp** — `handlePublish`; on success notice "Published to {n} member(s)." (singular when `n===1`); if it was being edited, reset; refresh (`:147-161`).
- All four mutations run inside `useTransition`'s `startTransition`; `pending` disables every input and button while in flight (`:89, 107, 135, 150`).
- On any action failure, the returned `error` string is shown in the composer error banner and the operation aborts (no refresh) (`:111-114, 137-139, 152-154`).

## States & presentations

Global-state rows that apply to this surface:

- **Empty** — Drafts: "No drafts."; Published: "Nothing published yet." (`:280-281, 332-335`). Composer always present.
- **Loading** — server-rendered page (`force-dynamic`); the manager has no skeleton; freshness comes from `router.refresh()` after each mutation.
- **Populated** — drafts and published lists render their cards; counts in section headers.
- **Validation-error** — empty title/body disables submit client-side; server-side Zod messages ("Give it a title.", "Write the announcement.") surface in the destructive error banner.
- **Submitting/pending** — `pending` true: all fields + buttons disabled; submit shows spinning `Loader2`.
- **Success** — emerald notice text per action (saved / updated / deleted / published-to-N); notice suppressed if an error is also set.
- **Disabled** — submit disabled when title or body is blank or `pending`; row buttons disabled when `pending`.
- **Invite-gated** — `!hasCampAccess` → redirect `/signup/required` (page) / "Your account isn't camp-active yet." (action).
- **Pending-approval** — `!isApproved` → redirect `/pending-approval` (page) / "Your account is still awaiting approval." (action).
- **Rejected** — terminal; `isApproved` is false for `approval_status='rejected'`, so the same pending-approval block applies (no separate rejected branch in this surface).
- **Captain-only-locked** — there is NO visible-but-locked view here: a non-captain is redirected to `/` (home) entirely (`page.tsx:28-30`); the action returns "Captain access only."

Presentation variants chosen at compose time (how the published delivery interrupts each recipient — recipient-side rendering is unit 27):
- **acknowledge** — full-screen takeover; recipient scrolls and presses Acknowledge to dismiss; the only variant that records `acknowledgedAt` and shows the "X/Y acknowledged" roll-up.
- **popup** — transient dismissable pop-up, no acknowledgement.
- **feed** — silent; lands in the inbox behind the header bell only.

## Enums, options & configurable values

- **`AnnouncementPresentation`** (Zod `z.enum`, `announcement.ts:8-12`; mirrors DB `broadcast_presentation` pgEnum, `schema.ts:166-170`): `"acknowledge"`, `"popup"`, `"feed"`. Type alias in `broadcasts.ts:29-30` derives from `broadcastPresentationEnum.enumValues`.
- **Composer presentation defaults** — `EMPTY_FORM.presentation = "acknowledge"` (`announcements-manager.tsx:75`); Zod `ComposeAnnouncementInput.presentation` `.default("acknowledge")` (`announcement.ts:26`).
- **DB column default** — `broadcasts.presentation` and `notification_deliveries.presentation` both DEFAULT `"feed"` at the schema level (`schema.ts:783-785, 846-848`) — NOTE the schema default (`feed`) differs from the compose default (`acknowledge`); composer/Zod always supplies a value so the DB default is never relied on for announcements.
- **`PRESENTATION_META`** UI map (`announcements-manager.tsx:42-61`):
  - `acknowledge`: label "Full-screen — must acknowledge"; hint "Takes over each member's screen. They scroll and press Acknowledge to dismiss."; icon `Megaphone`.
  - `popup`: label "Pop-up — dismissable"; hint "A transient pop-up. No acknowledgement required."; icon `MessageSquare`.
  - `feed`: label "Quiet — inbox only"; hint "No interruption. Lands behind the header bell."; icon `Bell`.
- **Pill short-words** (`AnnouncementHeader`): `acknowledge`→"Acknowledge", `popup`→"Pop-up", else→"Inbox" (`:385-389`).
- **`broadcast_kind` pgEnum** (`schema.ts:128-134`): `announcement`, `team_message`, `lead_directive`, `reminder`, `system` — this unit hard-codes `kind='announcement'`.
- **`broadcast_scope` pgEnum** (`schema.ts:136-142`) / `BroadcastScope` type (`audience.ts:6-11`): `everyone`, `team`, `team_leads`, `drivers`, `individual` — this unit hard-codes `scope='everyone'`. Other scopes belong to the gating + push UIs (`announcement.ts:18-22` comment).
- **`notification_channel` pgEnum** (`schema.ts:144-148`): `push`, `in_app`, `both`; `broadcasts.channel` DEFAULT `"both"` (`schema.ts:778`). The composer never sets channel — drafts inherit DEFAULT `both`; publish copies it onto each delivery.
- **`push_delivery_status` pgEnum** (`schema.ts:150-155`): `queued`, `sent`, `failed`, `skipped`; `notification_deliveries.pushStatus` DEFAULT `"queued"` (unit 27 territory).
- **Field caps**: title `max(120)` / `maxLength={120}`; body `max(5000)` / `maxLength={5000}`; textarea `rows={6}`.
- **`refType`** stamped on publish-fanned deliveries = `"announcement"`; `refId` = the broadcast id (`broadcasts.ts:279-280`).

## Data model touched

(must agree with unit 29 — the schema.)

- **`broadcasts`** (`schema.ts:763-807`): `id` (uuid pk, `defaultRandom`), `senderId` (uuid → `users.id`, `onDelete:'set null'`), `kind` (`broadcast_kind`, notNull — `'announcement'` here), `scope` (`broadcast_scope`, notNull — `'everyone'` here), `team` (`team` enum, nullable — unused here), `title` (text notNull), `body` (text notNull), `channel` (`notification_channel` notNull default `'both'`), `presentation` (`broadcast_presentation` notNull default `'feed'`), `refType` (text nullable), `refId` (uuid nullable), `publishedAt` (timestamp, NULL=draft), `dispatchedAt` (timestamp, NULL until fanned out), `sendAt` (timestamp, NULL/≤now = immediate), `createdAt` (timestamp notNull defaultNow). Indexes: `broadcasts_sender_idx`, `broadcasts_created_at_idx`.
- **`broadcast_targets`** (`schema.ts:810-823`): `broadcastId`+`userId` composite PK; for `scope='individual'` only — NOT touched by this unit (everyone-scope).
- **`notification_deliveries`** (`schema.ts:830-887`): `id` (uuid pk), `broadcastId` (uuid → `broadcasts.id`, `onDelete:'cascade'`, nullable for system rows), `userId` (uuid → `users.id`, notNull, `onDelete:'cascade'`), `title` (text notNull), `body` (text notNull), `channel` (notNull), `presentation` (notNull default `'feed'`), `pushStatus` (default `'queued'`), `refType`/`refId`, `readAt`, `acknowledgedAt`, `deliveredAt`, `createdAt`. Publish writes one row per recipient copying `title/body/channel/presentation` + `refType='announcement'`/`refId=broadcastId`. Indexes: `..._user_read_idx`, `..._user_ack_idx`, `..._broadcast_idx`, and partial UNIQUE `notification_deliveries_broadcast_user_uniq` on `(broadcastId, userId) WHERE broadcastId IS NOT NULL` (powers `ON CONFLICT DO NOTHING` dedupe).
- **`users`** (read-only here): `id`, `isSystem`, `sanitised` (audience exclusion), `displayName` (sender name). `rank` read for the gate.
- **`team_memberships`** / **`driver_profiles`** read only for non-everyone scopes (not exercised by this unit).
- **`AnnouncementSummary` interface** (`broadcasts.ts:96-110`): `id`, `title`, `body`, `presentation`, `senderId` (nullable), `senderName` (nullable), `publishedAt` (Date|null), `createdAt` (Date), `recipientCount` (number, 0 for drafts), `acknowledgedCount` (number).
- **`DraftInput`** (`broadcasts.ts:151-156`): `senderId`, `title`, `body`, `presentation`.
- **`PublishResult`** (`broadcasts.ts:214-216`): `{ ok:true; recipientCount } | { ok:false; error }`.

## Validation, edge cases & business rules

- **Zod `ComposeAnnouncementInput`** (`announcement.ts:23-27`): `title` `z.string().trim().min(1, "Give it a title.").max(120)`; `body` `z.string().trim().min(1, "Write the announcement.").max(5000)`; `presentation` `AnnouncementPresentation.default("acknowledge")`. Server actions surface `parsed.error.issues[0]?.message ?? "Invalid."` (`actions.ts:50, 71`).
- **Client submit guard** — disabled unless both trimmed title & body are non-empty (`announcements-manager.tsx:261`), so the Zod min(1) is a server-side backstop.
- **Author-private drafts** — every draft mutation is locked by `isOwnedAnnouncementDraft` (id + senderId + kind='announcement' + scope='everyone' + publishedAt IS NULL). A draft owned by another captain, of another kind, or already published is invisible to update/delete/publish → returns `false`/error (`broadcasts.ts:36-44, 181-212`). Captains do NOT see each other's draft edit controls beyond what the predicate enforces server-side; the list shows all announcements but edit/delete/publish only succeed on rows the caller owns.
- **Defence-in-depth gate** — `requireCaptain` re-checks auth/access/approval/rank in every action even though the page already gated; the data layer "trusts the senderId it is handed" (`broadcasts.ts:26-27`), so the action gate is the real authority.
- **Publish transaction** (`broadcasts.ts:228-290`):
  1. Claim: `UPDATE broadcasts SET publishedAt=now, dispatchedAt=now WHERE isOwnedAnnouncementDraft(...)` RETURNING id/title/body/channel/presentation. No row → `{ ok:false, error:"Draft not found, already published, or not yours." }`.
  2. `resolveAudience({ id, scope:'everyone', team:null }, senderId)` → recipient ids.
  3. Zero recipients → `{ ok:true, recipientCount:0 }` (publish still succeeds, fans out to nobody).
  4. Bulk INSERT one delivery per recipient `.onConflictDoNothing()` → `{ ok:true, recipientCount: ids.length }`.
- **Idempotent / double-submit safe** — the claim only flips an unpublished owned row, so a second publish of the same draft finds nothing to claim and is rejected; the `(broadcast_id, user_id)` unique index + `ON CONFLICT DO NOTHING` guarantees no double fan-out even on retry (`broadcasts.ts:218-227, 258-283`).
- **Sender excluded** — `computeAudience` filters `id !== senderId`: the author never receives their own announcement (`audience.ts:63`). UI copy: "Everyone but you receives it."
- **Non-real recipients excluded** — system actors (`isSystem`) and sanitised accounts (`sanitised`) are dropped from the audience (`audience.ts:34-35`).
- **`recipientCount` is the audience size at publish time**, returned to the UI notice; the list's `recipientCount` is a live `count(*)` of delivery rows — these agree because publish creates exactly that many rows (less any `ON CONFLICT` skips).
- **Acknowledged roll-up** is shown only for `presentation='acknowledge'` (`announcements-manager.tsx:350`); popup/feed deliveries never stamp `acknowledgedAt`, and the recipient-side `acknowledgeDelivery` refuses to stamp non-acknowledge deliveries (`broadcasts.ts:450-453`).
- **No edit after publish** — published rows have no edit/delete controls; the owned-draft predicate's `publishedAt IS NULL` clause also blocks server-side mutation. No "unpublish" / "recall" / "republish" action exists.
- **Recipient `senderName`** comes from `users.displayName` via left join; if the sender row was deleted (`senderId` → `set null`), `senderName` is null.

## Sub-components / variants

- **`AnnouncementsManager`** (default export) — the whole client surface; holds `FormState` (`editingId`, `title`, `body`, `presentation`), `error`, `notice`, `pending`.
- **`AnnouncementHeader`** — title + presentation pill; reused by both drafts and published cards.
- **`PRESENTATION_META`** — the icon/label/hint table (3 entries; no dead variants).
- **Server-only validators/handlers:** `requireCaptain` (gate), the four server actions, the data-layer writers, the `isOwnedAnnouncementDraft` predicate, `resolveAudience`/`computeAudience`.
- **E2E test backend** (`test-store.ts:356-471`) — mirrors create/update/delete/publish/list against in-memory arrays under `E2E_TEST_MODE`. NOTE divergences from real behaviour: (a) it carries NO `kind`/`scope` columns, so its draft predicate is only `(id + senderId + publishedAt===null)` — it does not enforce kind/scope ownership; (b) its publish audience is "all `usersByAuthId` values except sender" with NO `isSystem`/`sanitised` filtering; (c) no `ON CONFLICT` dedupe / transaction. The facade (`notifications.ts:117-119`) selects backend by `isE2ETestMode()`.
- **Dead/unused-here:** `broadcasts.ts` also exports `dispatchDueBroadcasts` (scheduled cron fan-out — unit 27), `getPendingAcknowledgements`, `acknowledgeDelivery`, `listInbox`, `countUnread`, `markRead` (recipient inbox/acknowledge gate — unit 27) and the `team`/`team_leads`/`drivers`/`individual` scope branches of `computeAudience` (other compose UIs) — none are exercised by this captain-composer surface, which only ever creates `scope='everyone'` announcements published inline.
