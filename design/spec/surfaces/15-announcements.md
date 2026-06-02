# Captain announcements (composer) — functional brief

- **Route(s):** `/captains/announcements`
- **Canonical board(s):** `design/.spec-extract/boards/27-s18-announcements.txt` (S18 Announcements, 430px)
- **Superseded-or-dropped:** none dropped. The board is mobile-only (430px); no desktop/terminal variant was drawn (unlike the roster). The board omits the **edit-draft mode** and the **cancel-edit** affordance present in live code — restored here from code (boards omit, not contradict). The current code's **hard redirect for non-captains is superseded by Decision 3** (preview-but-locked).
- **Breakpoints:** Mobile-first 430px is canonical (board width). Single responsive column; no separate desktop board exists for this surface. The live page uses `max-w-3xl` (wider than the global `max-w-lg`) — flagged as an ugly truth; the spec target is the standard mobile-first column, widening gracefully on larger viewports (see Open questions).

## Purpose

A captain-only surface to author camp-wide announcements and broadcast them to the whole camp. A captain composes a message (title, body, and a **presentation / delivery mode** that decides how hard the message interrupts each recipient), saves it as a draft, then edits / deletes / publishes it. Publishing fans the announcement out to **every real camp member except the author**, writing one notification-delivery row per recipient (title/body/channel/presentation copied so each recipient's inbox + acknowledge gate is self-contained). The same screen lists the captain's drafts (editable) and the published announcements with delivery roll-ups (recipient count, acknowledged count for the acknowledge mode, "by you" marker, timestamp).

This is the **compose + lifecycle** half of the broadcasts engine. The recipient-side rendering (full-screen acknowledge takeover, pop-up, inbox bell) and the scheduled cron fan-out live in the notifications/push surfaces (S12 / "unit 27") — this surface stops at the inline fan-out into `notification_deliveries`. This surface always creates `kind='announcement'`, `scope='everyone'` broadcasts; scoped (team / drivers / individual) and scheduled sends belong to other compose UIs.

Lead/intro copy (board): heading **"Announcements & notifications"**; lead **"Compose a message, save it as a draft, then publish it to the whole camp. Everyone but you receives it. A full-screen announcement takes over each member's screen until they acknowledge it."**

## Layout & modules (decomposition)

Top-to-bottom on a single 430px column inside the standard detail-page chrome:

### M0 — Page chrome & header
- **Back link** ("⟶ back"): `ChevronLeft` + **"Camp tools"** → `/captains/tools` (ghost link). Board labels it "Camp tools"; live code points the back link to `/captains/tools`.
- **H1** "Announcements & notifications" (`Inter/22px/700/$foreground`).
- **Lead paragraph** (`Inter/13px/$muted-foreground`) — full copy above.
- The page is a server component (`force-dynamic`), gated (see States → gating), and renders the client `<AnnouncementsManager>` with `announcements` + `currentUserId`.

### M1 — Composer card ("New announcement" / "Edit draft")
A single bordered card (`fill:$card stroke:$border r:$radius pad:16 gap:14`) holding the compose form.
- **Card title**: "New announcement" when composing fresh; **"Edit draft"** when `editingId` is set (code; board shows only "New announcement").
- **Cancel edit** ghost button (`X` icon, label "Cancel edit") — appears **only while editing**; clears the form back to empty + clears error (code; not on board).
- **M1a Title field** — Label "Title"; `Input`, `maxLength=120`, placeholder **"Burn-night briefing"**.
- **M1b Message field** — Label "Message"; `Textarea`, `rows=6`, `maxLength=5000`, placeholder **"What does everyone need to know?"**; rendered `whitespace-pre-wrap` downstream. **Voice (Decision 5):** the message body is a `long_text`-class field, so it carries a **`DictatePill`** affordance (field-level dictation) wiring to the `S21` RecorderPanel — speak → transcript → "Use this text" inserts into the body. (NEW vs both board and code; mandated by Decision 5. No home mic.)
- **M1c "How it lands" presentation selector** — Label "How it lands"; a `Select` over the **3 delivery modes**, each rendered as icon + label; a muted hint line below echoes the selected mode's hint. This is the delivery-mode picker called out in the surface guidance. (See M1c detail below.)
- **M1d Inline banners** — destructive **error banner** (`role="alert"`, `triangle-alert` icon, `$destructive` on `#f83e5a1f` tint) and **success banner** (`check` icon, `$accent`/emerald on `#00dcff1f` tint). Success is suppressed whenever an error is present. Board shows both states stacked as examples ("Give it a title." / "Draft saved.").
- **M1e Submit button** — single primary button, full-width on board (`fill:$primary`): label **"Save draft"** (new) / **"Update draft"** (editing); shows a spinning `Loader2` while pending, else a `Pencil` icon. Disabled until both title and body are non-empty (trimmed) and not pending.

#### M1c detail — presentation / delivery-mode selector (all 3 modes)
Closed trigger shows the active mode's icon + label + `chevron-down`. Open popover (`fill:$popover stroke:$border`) lists all three:
| value | icon | label (composer) | hint | pill short-word |
|---|---|---|---|---|
| `acknowledge` (default) | `megaphone` ($accent on trigger) | "Full-screen — must acknowledge" | "Takes over each member's screen. They scroll and press Acknowledge to dismiss." | "Acknowledge" |
| `popup` | `message-square` | "Pop-up — dismissable" | "A transient pop-up. No acknowledgement required." | "Pop-up" |
| `feed` | `inbox` (board) / `bell` (code) | "Quiet — inbox only" | "No interruption. Lands behind the header bell." | "Inbox" |

Note the icon drift for the `feed` mode: board uses `inbox`, live code uses `Bell`. Reconcile to one (see Divergences).

### M2 — Drafts list
- Section header **"Drafts"**, with `(count)` appended only when `drafts.length > 0` (board shows "Drafts (1)").
- **Empty state**: "No drafts."
- Each **DraftCard** (`fill:$card stroke:$border r:$radius pad:14 gap:10`):
  - Header row: title (`Inter/15px/700`) + **presentation pill** (short-word badge, e.g. "Acknowledge" on `#ff008c2e`).
  - Body text (`Inter/13px/$muted-foreground`, `whitespace-pre-wrap`).
  - Action row (3 buttons): **Edit** (ghost/outline, `Pencil`), **Delete** (ghost, destructive text + `$destructive` stroke, `Trash2`), **Publish to camp** (primary, `Send`).
- Drafts = announcements where `publishedAt === null`.

### M3 — Published list
- Section header **"Published"**, with `(count)` appended only when `published.length > 0` (board shows "Published (1)").
- **Empty state**: "Nothing published yet."
- Each **PublishedCard** (`fill:$card stroke:$border r:$radius pad:14 gap:10`):
  - Header row: title + presentation pill (e.g. "Inbox" on `#00dcff26`).
  - Body text.
  - **Meta footer row** (`Inter/12px`): "Sent to {recipientCount} member(s)" (singular/plural) + " · by you" when `senderId === currentUserId`; for `acknowledge` mode only, a `CheckCircle2` + "{acknowledgedCount}/{recipientCount} acknowledged" ($accent).
  - **Timestamp** line: "Published {date, time}" (board "Published 28 May 2026, 14:02"; code `new Date(publishedAt).toLocaleString()`).
- Published rows are **read-only** here — no edit/delete/republish/unpublish/recall.
- Published = announcements where `publishedAt !== null`.

### M4 — AnnouncementHeader (shared sub-component)
Title + presentation pill; reused by both DraftCard and PublishedCard. Pill = mode icon + short-word ("Acknowledge" / "Pop-up" / "Inbox"); `title` attribute = the mode's hint.

## Components used (reusable + new)

Reusable (canonical canvas set + existing `@camp404/ui`):
- **InputField** (canvas #06) / `Input` (`@camp404/ui`) — Title field. Variant: single-line, maxLength 120.
- `Textarea` (`@camp404/ui`) — Message field. Props: rows=6, maxLength=5000.
- `Label` (`@camp404/ui`) — field labels ("Title", "Message", "How it lands").
- `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` / `SelectValue` (`@camp404/ui`) — the "How it lands" delivery-mode selector.
- **Button-Primary** (canvas #04) / `Button` (`@camp404/ui`) — Save/Update draft, Publish to camp.
- **Button-Outline** (canvas #05) / `Button variant=ghost|outline` — Edit, Cancel edit; Delete (destructive variant).
- **Card** (canvas #07) — composer card, draft cards, published cards (board draws bespoke cards; unify on Card where practical).
- **EmptyState** (canvas #08) — "No drafts." / "Nothing published yet." (board draws plain muted text; reconcile to EmptyState or keep as inline copy — minor).
- **CaptainLock** (canvas #09) — the preview-but-locked gating treatment for non-captains (Decision 3); see States.

New (not among the 10 canvas reusables nor existing `@camp404/ui`):
- **AnnouncementsManager** — the client surface container; holds form/error/notice/pending state; orchestrates the 4 mutations. (Surface-local, exists in code.)
- **AnnouncementHeader** — shared title + presentation pill (M4). (Surface-local, exists in code.)
- **PresentationSelect** — the "How it lands" selector specialised over the 3-mode `PRESENTATION_META` map (icon/label/hint). (Surface-local; thin wrapper over `Select`.)
- **PresentationPill** — the short-word delivery-mode badge. (Surface-local; the pill inside AnnouncementHeader.)
- **DraftCard** / **PublishedCard** — the two list-row cards. (Surface-local.)
- **DictatePill** — field-level dictation trigger on the Message body (Decision 5). NEW to this surface; shared component sourced from S21. Opens the `RecorderPanel`.
- **RecorderPanel** (S21) — the dictation recorder/transcript states (IDLE / REQUESTING ACCESS / RECORDING / PROCESSING / ERROR / TranscriptResult). Shared; defined in the S21 voice-dictation spec. Reused, not redefined here.

## States

### Content / list states
- **Empty** — Drafts: "No drafts."; Published: "Nothing published yet." Composer always renders.
- **Loading** — server-rendered (`force-dynamic`); no client skeleton. Freshness comes from `router.refresh()` after each mutation. (No spinner on initial load beyond the framework navigation.)
- **Populated** — draft and published cards render; section headers show `(count)`.

### Composer form states
- **Idle (new)** — card titled "New announcement"; empty fields; default presentation `acknowledge`; submit disabled.
- **Editing** — card titled "Edit draft"; fields pre-filled from the draft; **Cancel edit** visible; submit reads "Update draft".
- **Validation-error** — submit disabled client-side while title or body is blank; server-side Zod messages ("Give it a title." / "Write the announcement.") surface in the destructive error banner.
- **Submitting / pending** — `pending` true: **all** inputs + buttons (composer and every card's row buttons) disabled; submit shows spinning `Loader2`. Applies across the whole manager during any of the 4 mutations.
- **Success** — emerald/`$accent` notice per action: "Draft saved." / "Draft updated." / "Draft deleted." / "Published to {n} member(s)." Notice suppressed if an error is also set.
- **Action-failure** — returned `error` string shown in the error banner; operation aborts, **no refresh**.
- **Disabled** — submit disabled when title or body blank or pending; row buttons disabled when pending.

### Delivery-mode (presentation) variants (chosen at compose time)
- **acknowledge** (default) — full-screen takeover; recipient scrolls + presses Acknowledge to dismiss; the **only** variant that records `acknowledgedAt` and shows the "X/Y acknowledged" roll-up on the published card.
- **popup** — transient dismissable pop-up; no acknowledgement.
- **feed** — silent; lands in the inbox behind the header bell only.
(Recipient-side rendering of these three is S12 / unit 27; here they are just the compose-time choice + the roll-up gating.)

### Gating states (Decision 3 — preview-but-locked; OVERRIDES current hard redirect)
The live code **hard-redirects** non-captains to `/` and the actions return "Captain access only." **Per Decision 3 this is replaced** by preview-but-locked:
- **Invite-gated** — `!hasCampAccess` → existing redirect `/signup/required` (unchanged; this is the camp-access gate, not the rank gate).
- **Onboarding-incomplete** — out of scope here (captain surface presumes an active account); inherits global routing.
- **Pending-approval** — `!isApproved` → existing redirect `/pending-approval`.
- **Rejected** — terminal; `isApproved` is false for `rejected`, so the pending-approval block applies (no separate branch).
- **Preview-but-locked (lower rank)** — a **member** (non-captain) can **navigate in**. The surface **renders its structure/chrome** (header, composer skeleton, list section headers) but returns **NO data** (empty drafts/published) and **all controls are inert** (composer fields + Save/Publish/Edit/Delete disabled). Treatment = **`CaptainLock`** banner / "VIEW ONLY · no data for your rank" (same as the home rank-section preview and roster mobile). NOT a redirect, NOT a blocking overlay.
- **Captain (authorised)** — full read/write.
- **Defence-in-depth** — server actions still re-run `requireCaptain` (auth → camp-access → approval → rank). With Decision 3 the action gate for a non-captain returns a refusal (`"Captain access only."`); since the UI controls are inert under CaptainLock, the action is never legitimately reachable, but the gate remains the real write authority. (The data load for a non-captain returns no announcement data.)

## User actions

- **Type a title** — ≤120 chars (client `maxLength` + server Zod `max(120)`).
- **Type a message body** — ≤5000 chars (client `maxLength` + server Zod `max(5000)`); supports newlines (`whitespace-pre-wrap` on display).
- **Dictate the message body** (Decision 5) — tap `DictatePill` → RecorderPanel records → transcribes → "Use this text" inserts the transcript into the body field (editable after). "Re-record" re-runs; ERROR state offers "Try again".
- **Pick a delivery mode** — Select among `acknowledge` / `popup` / `feed`; hint line updates live.
- **Save draft** — primary submit (new mode). → creates an unpublished `broadcasts` row (`kind='announcement'`, `scope='everyone'`); notice "Draft saved."; form resets; `router.refresh()`.
- **Update draft** — primary submit (editing mode). → updates title/body/presentation of the owned draft; notice "Draft updated."; reset; refresh.
- **Cancel edit** — discards edits, returns composer to new-announcement mode (clears form + error).
- **Edit a draft** — loads the draft's id/title/body/presentation into the composer; clears error + notice; switches card title to "Edit draft".
- **Delete a draft** — removes the owned draft; if it was the one being edited, also resets the composer; notice "Draft deleted."; refresh.
- **Publish to camp** — fans the draft out to every real member except the author; stamps `publishedAt`/`dispatchedAt`; notice "Published to {n} member(s)." (singular when n===1); if it was being edited, reset; refresh. Idempotent (double-submit safe).
- All four mutations run inside a `useTransition`; `pending` disables every input/button while in flight; on failure the error banner shows and the op aborts (no refresh).

## Data & enums (mapped to schema.ts)

**Tables read/written:**
- **`broadcasts`** (`schema.ts:763-807`) — the draft/announcement row. Written: `senderId` (=acting captain), `kind='announcement'` (hard-coded), `scope='everyone'` (hard-coded), `title` (notNull), `body` (notNull), `presentation` (notNull; composer always supplies — see default note), `channel` (notNull DEFAULT `'both'`; composer never sets it), `publishedAt` (NULL=draft; stamped on publish), `dispatchedAt` (stamped on publish), `createdAt` (defaultNow). Read for lists: `title`, `body`, `presentation`, `senderId`, `publishedAt`, `createdAt` + joined `senderName`. Indexes: `broadcasts_sender_idx`, `broadcasts_created_at_idx`.
- **`notification_deliveries`** (`schema.ts:830-887`) — written by publish: one row per recipient copying `title`/`body`/`channel`/`presentation` + `refType='announcement'`, `refId=broadcastId`; `pushStatus` DEFAULT `'queued'`. Read (correlated counts) for `recipientCount` and `acknowledgedCount`. Partial UNIQUE `(broadcastId, userId) WHERE broadcastId IS NOT NULL` powers `ON CONFLICT DO NOTHING` dedupe. `readAt`/`acknowledgedAt`/`deliveredAt` are recipient-side (unit 27); only `acknowledgedAt` is read here (the roll-up count).
- **`broadcast_targets`** (`schema.ts:810-823`) — NOT touched (everyone-scope only).
- **`users`** (read-only) — `id`, `displayName` (sender name via left join), `isSystem` + `sanitised` (audience exclusion), `rank` (the captain gate).
- **`team_memberships`** / **`driver_profiles`** — read only by `resolveAudience` for non-everyone scopes; **not exercised** by this everyone-scope surface.

**Enums:**
- **`broadcast_presentation`** (`schema.ts:166-170`) ↔ Zod `AnnouncementPresentation` (`announcement.ts:8-12`): `acknowledge` | `popup` | `feed`. The 3 delivery modes.
- **`broadcast_kind`** (`schema.ts:128-134`): `announcement` | team_message | lead_directive | reminder | system — hard-coded `announcement`.
- **`broadcast_scope`** (`schema.ts:136-142`): `everyone` | team | team_leads | drivers | individual — hard-coded `everyone`.
- **`notification_channel`** (`schema.ts:144-148`): push | in_app | `both` — composer never sets; drafts inherit DEFAULT `both`; copied to deliveries on publish.
- **`push_delivery_status`** (`schema.ts:150-155`): `queued` | sent | failed | skipped — delivery default `queued`; recipient/dispatch territory (unit 27).

**Validation contract (Zod `ComposeAnnouncementInput`, `announcement.ts:23-27`):** `title` trim min(1) "Give it a title." max(120); `body` trim min(1) "Write the announcement." max(5000); `presentation` default `acknowledge`.

**Defaults note:** compose default = `acknowledge` (`EMPTY_FORM` + Zod `.default`); DB column default = `feed` (conservative fallback for out-of-band inserts). Composer always supplies a value, so the DB default is never relied on for announcements — intentional, safe.

**Field caps:** title 120; body 5000; textarea rows 6.

**Shape interfaces (data layer):** `AnnouncementSummary` (`broadcasts.ts:96-110`): `id`, `title`, `body`, `presentation`, `senderId` (nullable), `senderName` (nullable), `publishedAt` (Date|null), `createdAt` (Date), `recipientCount` (0 for drafts), `acknowledgedCount`. `DraftInput`: `senderId`, `title`, `body`, `presentation`. `PublishResult`: `{ ok:true; recipientCount } | { ok:false; error }`.

**NEW schema:** none. This surface introduces no schema change (the only redesign schema change, `captain_promotion_requests`, belongs to the make-captain flow, not here).

## Validation & edge cases

- **Client submit guard** — Save/Update disabled unless both trimmed title and body are non-empty (Zod min(1) is the server backstop).
- **Author-private drafts** — every draft mutation (update/delete/publish) is locked by `isOwnedAnnouncementDraft` = `id` + `senderId` + `kind='announcement'` + `scope='everyone'` + `publishedAt IS NULL`. A draft owned by another captain, of another kind, or already published is not mutable → returns `false`/error ("Draft not found or already published." / "Draft not found, already published, or not yours."). The list may show all announcements, but edit/delete/publish only succeed on rows the caller owns.
- **Defence-in-depth gate** — `requireCaptain` re-checks auth/access/approval/rank on every action; the data layer trusts the `senderId` it is handed, so the action gate is the real authority.
- **Publish transaction** (`broadcasts.ts:228-290`): (1) claim+stamp the owned unpublished draft (`publishedAt=now`, `dispatchedAt=now`) RETURNING title/body/channel/presentation — no row → `{ ok:false }`; (2) resolve audience (everyone, minus system/sanitised, minus sender); (3) zero recipients → `{ ok:true, recipientCount:0 }` (publish still succeeds, reaches nobody); (4) bulk insert one delivery per recipient `ON CONFLICT DO NOTHING`.
- **Idempotent / double-submit safe** — the claim only flips an unpublished owned row; a second publish finds nothing to claim and is rejected; the `(broadcastId, userId)` unique index + `ON CONFLICT DO NOTHING` prevents double fan-out on retry.
- **Sender excluded** — author never receives their own announcement (`id !== senderId`). UI copy: "Everyone but you receives it."
- **Non-real recipients excluded** — system actors (`isSystem`) and sanitised accounts dropped from the audience.
- **recipientCount consistency** — the publish-time audience size equals the live `count(*)` of delivery rows shown in the list (less any `ON CONFLICT` skips).
- **Acknowledged roll-up** shown only for `presentation='acknowledge'`; popup/feed never stamp `acknowledgedAt`.
- **No edit/recall after publish** — published rows have no controls; the owned-draft predicate's `publishedAt IS NULL` also blocks server-side mutation. No unpublish/republish exists.
- **Deleted sender** — `senderId` is `set null` on user delete; `senderName` then null; "by you" check uses `senderId === currentUserId` so a null sender is never "by you".
- **Long content** — body display wraps (`whitespace-pre-wrap`); title/body capped by maxLength.
- **Dictation edge cases** (per S21) — mic permission denied / unreachable → ERROR state with "Try again"; transcript is editable before "Use this text"; cancelling the recorder leaves the body unchanged.

## Flows

- **Entry** — from Camp tools (`/captains/tools`) or direct nav. Page gates: camp-access → approval → rank.
  - Captain → full surface.
  - Member (lower rank) → **preview-but-locked** (CaptainLock, structure rendered, no data, controls inert) — Decision 3.
- **Compose → save** — fill title/body, pick mode (optionally dictate body) → "Save draft" → draft appears in Drafts list, composer resets, success notice.
- **Edit → update / cancel** — "Edit" on a draft → composer enters "Edit draft" mode prefilled → "Update draft" (saves) or "Cancel edit" (discards).
- **Delete** — "Delete" on a draft → removed from list, notice.
- **Publish** — "Publish to camp" on a draft → fan-out → draft moves to Published list with delivery roll-up, notice "Published to {n} member(s)."
- **Exits** — Back ("Camp tools") → `/captains/tools`; redirects on failed camp-access/approval gates.

## Divergences from feature-set reference — and resolution

1. **Gating: hard redirect (reference/code) vs preview-but-locked (Decision 3).** Reference unit and live `page.tsx` redirect non-captains to `/` and actions return "Captain access only." **Resolution:** Decision 3 wins — render structure, no data, inert controls, `CaptainLock` "VIEW ONLY · no data for your rank". Keep `requireCaptain` server gate as the write authority (defence-in-depth). The camp-access/approval redirects are retained (those are not the rank gate).
2. **Voice / dictation on the Message body (Decision 5).** Neither board nor code shows dictation here. **Resolution:** Decision 5 mandates field-level dictation on `long_text` fields → add a `DictatePill` on the Message body wired to S21 RecorderPanel. No home mic.
3. **`feed` mode icon: `inbox` (board) vs `Bell` (code).** **Resolution:** minor; pick one in build. Board's `inbox` reads more literally ("inbox only"); code's `Bell` matches "behind the header bell" copy. Lean to the board (`inbox`) as source of truth unless brand prefers the bell; flag.
4. **Layout width `max-w-3xl` (code) vs mobile-first 430px (board / global `max-w-lg`).** **Resolution:** board (430px mobile-first) is canonical; treat `max-w-3xl` as an ugly truth to reconcile to the standard column (widening gracefully). Flagged.
5. **Edit-draft mode + Cancel edit absent from board.** Board draws only "New announcement" + draft action "Edit". **Resolution:** boards omit (don't contradict) — restore the full edit/cancel mode from live code; it is implied by the "Edit" draft action.
6. **Token drift on pills/tints** — board uses raw hex tints (`#ff008c2e` for the Acknowledge pill, `#00dcff26` for Inbox, `#00dcff1f`/`#f83e5a1f` banners). **Resolution:** per Decisions §Tokens, reconcile to semantic tokens (add success/warning/info status tokens; `$accent` vs amber); keep the visual intent.
7. **Pill short-words vs composer labels** — pills say "Acknowledge"/"Pop-up"/"Inbox" while the composer Select says "Full-screen — must acknowledge"/"Pop-up — dismissable"/"Quiet — inbox only". **Resolution:** intentional (compact badge vs descriptive option); keep both, both present in board + code.

## Open questions / build reconciliations

- **OQ1** — `feed` icon: `inbox` (board) or `Bell` (code)? Pick one (see Divergence 3).
- **OQ2** — Layout width: confirm the standard mobile-first column target and whether to keep any wider desktop max-width; reconcile away `max-w-3xl` (Divergence 4).
- **OQ3** — Preview-but-locked data behaviour: confirm a non-captain sees **zero** announcement rows (empty lists under CaptainLock) vs structure-only with placeholder rows. Spec assumes zero data, inert controls (Decision 3 wording: "returns NO data").
- **OQ4** — `DictatePill`/RecorderPanel reuse: confirm the body field is classified `long_text` for the dictation affordance and that the shared S21 component is the source (Decision 5). No transcription backend is specced here.
- **OQ5** — `channel` is fixed to `both` (DB default; composer never sets it). Confirm announcements should not expose a push/in-app channel toggle in this composer (scoped/scheduled channel control lives with the push UIs).
- **OQ6** — No unpublish / recall / republish by design. Confirm captains never need to retract a published announcement (only re-author a fresh one).
- **OQ7** — EmptyState reuse: board draws plain muted text for "No drafts."/"Nothing published yet."; confirm whether to adopt the canvas `EmptyState` component or keep inline copy (minor).
