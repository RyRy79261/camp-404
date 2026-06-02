# AnnouncementsManager — organism plan

- **mapsTo + home:** **REUSE/EXTEND** — **keep app-local** (component-library.md
  line 530: "keep app-local"). It is **not** promoted to `@camp404/ui`: it is a
  `"use client"` surface container that calls `apps/web`-resident server actions
  (`./actions`), reads `useRouter`/`useTransition`, and composes the app-resident
  `RecorderPanel` (browser-coupled). `@camp404/ui` must stay framework/browser-agnostic
  (architecture.md §`@camp404/ui`), so this organism stays where it lives.
- **Target file:** `apps/web/app/captains/announcements/announcements-manager.tsx`
  (the live file; EXTEND in place). Its server host stays
  `apps/web/app/captains/announcements/page.tsx`; its actions stay
  `apps/web/app/captains/announcements/actions.ts`.

> **Classification rationale:** the organism **exists and works today** (all four
> mutations, edit/cancel, drafts/published split, presentation selector, delivery
> roll-up). The redesign **EXTENDs** it — extract the inline sub-components
> (`AnnouncementHeader`/`PresentationSelect`/`PresentationPill`/`DraftCard`/
> `PublishedCard`) and re-skin them onto the promoted `@camp404/ui` molecules,
> reconcile to the mobile-first column, snap raw-hex tints to status tokens, add the
> `DictatePill` voice affordance on the Message body (Decision 5), and convert the
> page's hard redirect to **preview-but-locked** (Decision 3). **No functionality is
> dropped** — the data layer (`broadcasts.ts`), the types (`ComposeAnnouncementInput`),
> and the four server actions are all REUSE-as-is (service-layer plan 04).

---

## Current state — what exists today (the old design's component/route markup)

Three files implement this surface today; all confirmed read.

### `apps/web/app/captains/announcements/page.tsx` (server component)
- `export const dynamic = "force-dynamic"`; metadata title.
- Gating spine (lines 19–30): `getAuthenticatedUserOrRedirect()` → `ensureCampUser` →
  `!hasCampAccess` → `redirect("/signup/required")` → `!isApproved` →
  `redirect("/pending-approval")` → **`campUser.rank !== "captain"` → `redirect("/")`**
  (the hard rank redirect that Decision 3 overrides).
- Loads `const announcements = await listAnnouncements()` (line 32) — called
  unconditionally, **before** any rank gate, for every authorised caller.
- Renders `<main className="mx-auto max-w-3xl px-6 py-10">` (the `max-w-3xl` ugly truth,
  S15 Divergence 4), a ghost `<Button asChild>` back-link to `/captains/tools` labelled
  "Camp tools" with `ChevronLeft`, an `<header>` H1 "Announcements & notifications" +
  lead paragraph, then `<AnnouncementsManager announcements={…} currentUserId={campUser.id} />`.

### `apps/web/app/captains/announcements/actions.ts` (`"use server"`)
- `requireCaptain()` (lines 23–40) — re-runs auth → camp-access → approval → rank;
  returns `{ ok:true, captainId }` or `{ ok:false, error }`. Returns `"Captain access only."`
  for a non-captain. This is the **defence-in-depth write authority** (S15 §gating).
- Four actions, each gated by `requireCaptain`, validating `ComposeAnnouncementInput.safeParse`
  and calling `lib/notifications` then `revalidatePath("/captains/announcements")`:
  `saveDraftAction(input)` → `{id}`; `updateDraftAction(id, input)`;
  `deleteDraftAction(id)`; `publishAction(id)` → `{recipientCount}`.
- Shared `ActionResult<T>` discriminated union (`{ok:true,…} | {ok:false,error}`).

### `apps/web/app/captains/announcements/announcements-manager.tsx` (`"use client"`, 394 lines)
- `PRESENTATION_META` (lines 42–61): `Record<AnnouncementPresentation, {label, hint, icon}>`
  with lucide JSX icons — `acknowledge`→`Megaphone`, `popup`→`MessageSquare`,
  **`feed`→`Bell`** (the code-vs-board `inbox` icon drift, S15 Divergence 3 / OQ1).
- `FormState` (`editingId|null`, `title`, `body`, `presentation`) + `EMPTY_FORM`
  (default `presentation: "acknowledge"`).
- `AnnouncementsManager({ announcements, currentUserId })`: `useRouter`, `useState<FormState>`,
  `error`/`notice` state, `useTransition` (`pending`). Splits
  `drafts = a.publishedAt === null` / `published = a.publishedAt !== null`.
- Handlers: `handleSave` (create-or-update via `editingId`), `handleEdit`, `handleDelete`,
  `handlePublish` — each clears error+notice, runs inside `startTransition`, sets a notice
  on success and calls `router.refresh()`; on `!result.ok` sets the error and aborts (no refresh).
- Composer `<section className="rounded-lg border p-5">` with title "New announcement"/"Edit draft",
  a "Cancel edit" ghost (`X`) only while editing, inline `Label`+`Input` (Title, `maxLength=120`),
  `Label`+`Textarea` (Message, `rows=6`, `maxLength=5000`), `Label`+`Select` ("How it lands",
  items render icon+label inline; muted hint `<p>` echoes the active mode), raw error `<p
  role="alert" text-destructive>` + success `<p text-emerald-400>` (suppressed when error set),
  and the submit `<Button>` ("Save draft"/"Update draft", `Loader2` spinner when pending,
  disabled until trimmed title+body non-empty).
- Drafts `<section>`: hand-rolled `<h2>` SectionHeader with `(count)`, "No drafts." muted text,
  `<li>` cards = `AnnouncementHeader` + `whitespace-pre-wrap` body + 3 buttons (Edit/Delete/Publish).
- Published `<section>`: same header pattern, "Nothing published yet." text, `<li>` cards =
  `AnnouncementHeader` + body + meta footer ("Sent to {n} member(s)" + " · by you" + acknowledge
  roll-up `CheckCircle2` + `toLocaleString()` timestamp). Published rows are read-only.
- `AnnouncementHeader` (lines 369–393): title `<h3>` + a hand-rolled `<span>` presentation
  pill (rounded-full border, `text-[11px]`, short-word "Acknowledge"/"Pop-up"/"Inbox", `title=hint`).

### Off-token / divergence inventory (carried for the redesign)
- `text-emerald-400` success line (raw colour); raw destructive `<p>` (no `Alert` shell).
- `max-w-3xl` page width (board canonical = mobile-first 430px / `max-w-lg`; S15 Divergence 4 / OQ2).
- Hand-rolled pill span and section `<h2>`s instead of promoted `Badge`/`SectionHeader`.
- No `DictatePill` on the Message body (Decision 5 not yet wired; S15 Divergence 2 / line 31).
- Hard rank redirect (no preview-but-locked; S15 Divergence 1 / Decision 3).
- `feed` icon = `Bell` (board wants `inbox`; S15 Divergence 3 / OQ1).

---

## Composition — leaves, core helpers, services, server/client split

### Leaf components it consumes (link plan files)

| Leaf | Plan file | Package / home | Role in this organism |
|---|---|---|---|
| **InputField** | [`molecule-inputfield.md`](./molecule-inputfield.md) | `@camp404/ui` (PROMOTE) | Title field (Label+Input+error wiring). Replaces the inline `<div><Label/><Input/></div>`. `maxLength=120`, placeholder "Burn-night briefing". |
| **Textarea** | [`atom-textarea.md`](./atom-textarea.md) | `@camp404/ui` (REUSE) | Message body. `rows=6`, `maxLength=5000`, placeholder "What does everyone need to know?". Used **directly** (not via `LongTextField` — that sub-renderer is wizard-only; see LongTextField plan §Consumers). |
| **Label** | [`atom-label.md`](./atom-label.md) | `@camp404/ui` (REUSE) | "How it lands" label (the Title/Message labels come bundled inside `InputField`/the textarea row). |
| **Select** | [`molecule-select.md`](./molecule-select.md) | `@camp404/ui` (REUSE/EXTEND) | The "How it lands" selector. The icon-row item is the documented `SelectItem` children convention; the muted hint line below the trigger is **this organism's** responsibility, not the component's (Select plan §Gaps row "Hint line"). |
| **Button** | [`atom-button.md`](./atom-button.md) | `@camp404/ui` (REUSE) | Submit (Save/Update draft); Cancel edit (ghost); per-card Edit (ghost), Delete (ghost+destructive), Publish to camp (primary); the page back-link. |
| **Badge** | [`atom-badge.md`](./atom-badge.md) | `@camp404/ui` (PROMOTE) | The **PresentationPill** short-word badge (`with-icon` variant) inside `AnnouncementHeader`. component-library merge map collapses presentation-pill → Badge. |
| **Alert** | [`molecule-alert.md`](./molecule-alert.md) | `@camp404/ui` (PROMOTE) | The composer error banner (`tone="destructive"`, `role="alert"`, `triangle-alert`) + success banner (`tone="success"`, `check`). Replaces the raw `<p text-destructive>` / `<p text-emerald-400>`. |
| **SectionHeader** | [`molecule-sectionheader.md`](./molecule-sectionheader.md) | `@camp404/ui` (PROMOTE) | The "Drafts (n)" / "Published (n)" headers. SectionHeader plan names this file as its hand-rolled source. |
| **Card** | [`molecule-card.md`](./molecule-card.md) | `@camp404/ui` (REUSE) | The composer card + each DraftCard / PublishedCard shell (`fill:$card stroke:$border r:$radius`). |
| **EmptyState** | [`molecule-emptystate.md`](./molecule-emptystate.md) | `@camp404/ui` (PROMOTE) | "No drafts." / "Nothing published yet." — `variant="inline"` (EmptyLog) per S15 OQ7 (reconcile from plain muted text). |
| **DictatePill** | [`molecule-dictatepill.md`](./molecule-dictatepill.md) | `@camp404/ui` (PROMOTE) | Field-level voice trigger on the Message body (Decision 5; DictatePill plan §Consumers + Step 5 names this organism the new consumer). Fires `onActivate → setDictating(true)`. |
| **RecorderPanel** | [`molecule-recorderpanel.md`](./molecule-recorderpanel.md) | `apps/web/components/voice/recorder-panel.tsx` (app-local PROMOTE/EXTEND) | Mounted when `dictating === true`, **sibling** of `DictatePill`. `onTranscript` → append into body; `onDismiss` → `setDictating(false)`. No `promptKey` (generic transcription, like the bug dialog). |
| **CaptainLock** | [`molecule-captainlock.md`](./molecule-captainlock.md) | `@camp404/ui` (PROMOTE) | The preview-but-locked treatment for non-captains (Decision 3). CaptainLock plan §Consumers + Step 7 name `AnnouncementsManager` as the consumer that renders it when `isCaptain === false`. `scope="surface"`. |

Sub-components that live **inside this file** (extracted from the inline markup, not new
package primitives): `AnnouncementHeader` (Badge-pill + title), `PresentationSelect`
(thin wrapper over `Select` specialised over `PRESENTATION_META`), `PresentationPill`
(the Badge call), `DraftCard`, `PublishedCard` — all surface-local per S15 §Components used.

### `@camp404/core` helpers
- **`appendTranscript(existing, addition, maxLength): string`** — the pure
  append-not-overwrite + `\n`-joiner + clamp logic. Shared with `LongTextField` and
  `ReportBugDialog` (architecture.md §Hybrid; LongTextField plan §Composition). This
  organism's `RecorderPanel` `onTranscript` callback is
  `(text) => setForm(f => ({ ...f, body: appendTranscript(f.body, text, 5000) }))`.
  Falls back to a 4-line inline closure if `@camp404/core` slips (no behaviour change).
- No other domain logic. Rank/clearance logic (`requireClearance`, `hasCampAccess`,
  `isApproved`) is consumed by the **page/server layer**, not by this client organism
  (CaptainLock plan §Composition: the component has zero domain-logic dependency).

### Services / server-actions it calls (named from service-layer plan 04)
All four are app-resident `"use server"` actions in `./actions.ts`, which delegate to the
`apps/web/lib/notifications.ts` facade over `@camp404/db/broadcasts` (real-vs-test split).
**All REUSE-as-is** — service-layer plan 04 §"REUSE as-is":

| Action (this organism calls) | lib/notifications fn | db fn | Returns |
|---|---|---|---|
| `saveDraftAction(payload)` | `createAnnouncementDraft` | `createAnnouncementDraft` (`broadcasts.ts:159`) | `{ id }` |
| `updateDraftAction(id, payload)` | `updateAnnouncementDraft` | `updateAnnouncementDraft` (`broadcasts.ts:181`) | `boolean` |
| `deleteDraftAction(id)` | `deleteAnnouncementDraft` | `deleteAnnouncementDraft` (`broadcasts.ts:202`) | `boolean` |
| `publishAction(id)` | `publishAnnouncement` | `publishAnnouncement` (`broadcasts.ts:228`) | `PublishResult` (`{ok,recipientCount}`) |

The page reads `listAnnouncements()` (`lib/notifications` → `broadcasts.ts:117`). The
publish fan-out writes one `notification_deliveries` row per recipient (`ON CONFLICT DO
NOTHING`), excluding system/sanitised accounts and the sender; recipient-side rendering
(ack-gate/popup/inbox bell) is **out of scope** (S12/S25, unit 27). The `popup` recipient
renderer and the Toast infra are NEW but belong to other surfaces' plans (service-layer 04
§NEW) — this organism only sets the compose-time `presentation` value.

### Server-component vs `"use client"` split
- **Server (`page.tsx`):** gating + data load + page chrome (back-link, H1, lead). Holds the
  preview-but-locked decision: gate by rank, withhold `listAnnouncements` for non-captains,
  pass `isCaptain` + (empty-or-real) `announcements` + `currentUserId` into the client manager.
- **Client (`announcements-manager.tsx`):** the whole interactive surface — form state,
  `useTransition`, the four mutations, `router.refresh()`, the `dictating` pill↔panel swap,
  and (when `isCaptain === false`) the `CaptainLock` render. `RecorderPanel`/`DictatePill`
  are browser-coupled, so the manager stays client.

---

## API & data flow

### Props
```ts
function AnnouncementsManager({
  announcements,   // AnnouncementSummary[] — REAL for a captain; EMPTY [] for preview-but-locked
  currentUserId,   // string — drives the "· by you" published-card marker
  isCaptain,       // boolean — NEW prop (Decision 3). false → render CaptainLock, inert controls
}): JSX.Element
```
`AnnouncementSummary` (`broadcasts.ts:96-110`): `id`, `title`, `body`, `presentation`,
`senderId` (nullable), `senderName` (nullable), `publishedAt` (`Date|null`), `createdAt`,
`recipientCount` (0 for drafts), `acknowledgedCount`. **No shape change** (service-layer 04).

> `isCaptain` is the only new prop. The current signature is `{ announcements, currentUserId }`;
> the redesign adds `isCaptain` so the manager can render the locked shell without a redirect.

### What it fetches vs receives
- **Receives (props):** everything. The organism fetches nothing client-side.
- **Server-fetched (page):** `listAnnouncements()` — **gated**: a captain gets the real list;
  a non-captain gets `[]` (the page must **not call** `listAnnouncements` for a non-captain —
  Decision 3 "returns NO data", S15 §gating, service-layer 04 §EXTEND, CaptainLock plan Step 7).
- **Transcript:** delivered by `RecorderPanel.onTranscript` (not fetched here); the recorder
  owns the `POST /api/voice/transcribe` round-trip (voice domain / S21).

### State flow
```
type title/body         → InputField/Textarea onChange → setForm → composer re-render
pick mode               → PresentationSelect onValueChange → setForm.presentation → hint updates
tap DictatePill         → setDictating(true) → RecorderPanel mounts (pill unmounts)
record → "Use this text"→ onTranscript(text) → appendTranscript(body, text, 5000) → setForm.body
dismiss recorder        → onDismiss → setDictating(false) → DictatePill remounts
Save/Update             → startTransition(saveDraftAction|updateDraftAction) → ok? notice + reset + router.refresh() : setError
Edit (draft card)       → setForm({editingId,title,body,presentation}) ; clear error+notice
Cancel edit             → reset() → EMPTY_FORM + clear error
Delete (draft card)     → startTransition(deleteDraftAction) → ok? (reset if editing this id) + notice + refresh : setError
Publish (draft card)    → startTransition(publishAction) → ok? (reset if editing) + "Published to {n} member(s)." + refresh : setError
```
Freshness comes from `router.refresh()` against the `force-dynamic` server page after each
successful mutation; there is no client cache of the list.

### Forms: actions + validation
- **Action wiring:** all four mutations run through `useTransition`; `pending` disables every
  input + every button across the manager while in flight.
- **Client guard:** Save/Update disabled unless trimmed `title` **and** `body` are non-empty.
- **Server validation:** `ComposeAnnouncementInput` (`@camp404/types/announcement.ts`):
  `title` trim min(1) "Give it a title." max(120); `body` trim min(1) "Write the announcement."
  max(5000); `presentation` default `acknowledge`. The first Zod issue message surfaces in the
  Alert error banner.
- **Owned-draft predicate** (server, REUSE): update/delete/publish only succeed on a row the
  caller owns and that is still an unpublished `announcement`/`everyone` draft
  (`isOwnedAnnouncementDraft`); otherwise the action returns a refusal string into the banner.
- **Idempotent publish:** the claim flips only an unpublished owned row; a double-submit finds
  nothing to claim and is rejected; the `(broadcastId,userId)` unique index + `ON CONFLICT DO
  NOTHING` prevents double fan-out (service-layer 04; S15 §edge cases).

---

## States — every state incl. the global matrix + gating

### Content / list states
- **Empty** — Drafts EmptyState "No drafts." / Published EmptyState "Nothing published yet.";
  the composer always renders (for a captain).
- **Loading** — server-rendered (`force-dynamic`); no client skeleton. Initial load is framework
  navigation; freshness via `router.refresh()`.
- **Populated** — Draft/Published cards render; SectionHeaders show `(count)` only when `> 0`.

### Composer form states
- **Idle (new)** — card "New announcement"; empty fields; default `presentation="acknowledge"`;
  submit disabled.
- **Editing** — card "Edit draft"; fields prefilled from the draft; **Cancel edit** visible;
  submit reads "Update draft".
- **Validation-error** — submit disabled client-side while title/body blank; server Zod messages
  ("Give it a title." / "Write the announcement.") surface in the destructive Alert.
- **Submitting / pending** — `pending` true: **all** composer inputs/buttons **and every card's
  row buttons** disabled; submit shows the spinning `Loader2`. Applies across the whole manager
  during any of the four mutations.
- **Success** — `tone="success"` Alert per action: "Draft saved." / "Draft updated." /
  "Draft deleted." / "Published to {n} member(s)." (singular when `n === 1`). Suppressed whenever
  an error is also set.
- **Action-failure** — returned `error` string in the destructive Alert; the op aborts, **no
  `router.refresh()`** (form state retained so the user can retry).
- **Disabled** — submit disabled when title/body blank or pending; row buttons disabled when pending.
- **dictating (body)** — `dictating === true` → DictatePill unmounts, `RecorderPanel` mounts
  (its own IDLE/REQUESTING/RECORDING/PROCESSING/ERROR/TranscriptResult sub-machine; see
  RecorderPanel plan). The pill never co-renders with the panel.

### Delivery-mode (presentation) variants — chosen at compose time
- **acknowledge** (default) — full-screen takeover recipient-side; the **only** mode that records
  `acknowledgedAt` and shows the "X/Y acknowledged" roll-up on the PublishedCard.
- **popup** — transient dismissable pop-up; no acknowledgement.
- **feed** — silent; lands behind the header bell only.
  (Recipient-side rendering of all three is unit 27 / S25, not this organism.)

### Global gating matrix (Decision 3 — preview-but-locked; OVERRIDES the current hard redirect)
The page-level spine; the manager honours the `isCaptain` prop.

| Gate | Decision | Where enforced |
|---|---|---|
| **Invite-gated** (`!hasCampAccess`) | `redirect("/signup/required")` (unchanged — camp-access gate, not the rank gate) | `page.tsx` |
| **Pending-approval** (`!isApproved`) | `redirect("/pending-approval")` (unchanged); `rejected` is `isApproved=false` → same branch | `page.tsx` |
| **Onboarding-incomplete** | out of scope (captain surface presumes an active account); inherits global routing | global spine |
| **Preview-but-locked (lower rank / member)** | **NO redirect.** Page renders chrome (back-link, H1, lead), **does NOT call `listAnnouncements`**, passes `announcements=[]` + `isCaptain=false`. Manager renders **`<CaptainLock scope="surface" />`** ("VIEW ONLY · no data for your rank") in place of the composer + lists; all controls inert/zero data | `page.tsx` (data withheld) + manager (`CaptainLock`, inert controls) |
| **Captain (authorised)** | Full read/write: real `announcements`, `isCaptain=true` | `page.tsx` + manager |
| **Defence-in-depth** | Server actions still run `requireCaptain` (auth→access→approval→rank); a non-captain action returns "Captain access only." Since UI controls are inert under CaptainLock, the action is never legitimately reachable, but the gate remains the real write authority | `actions.ts` (unchanged) |

> The standard per-leaf matrix mapped to this organism: **empty** (EmptyState) · **loading**
> (server, no skeleton) · **error** (Alert, no refresh) · **submitting** (whole-manager disable +
> spinner) · **success** (Alert) · **disabled** (submit guard / pending) · **preview-but-locked**
> (CaptainLock, zero data, inert — this IS a captain/rank surface, so the locked state is in scope).

---

## Build steps — ordered, with prerequisites + acceptance + tests

### Dependency prerequisites (must land first)
1. **`foundations-tokens` Phase 0** — status tokens (`success`/`warning`/`info`), radius scale,
   `--text-*` + font wiring. Gates Alert/Badge/SectionHeader/EmptyState skinning + the
   `text-emerald-400`→`success` swap.
2. **`@camp404/ui` promotions** — `Alert`, `Badge`, `SectionHeader`, `EmptyState`, `InputField`,
   `DictatePill`, `CaptainLock` must be built + exported (their leaf plans, build steps 1–2 each).
   `Select`/`Textarea`/`Button`/`Card`/`Label` are REUSE (already present).
3. **`RecorderPanel` EXTEND** — the `TranscriptResult` review state should land (RecorderPanel
   plan); the `onTranscript`/`onDismiss` contract is unchanged, so the current panel already
   satisfies the call (soft prerequisite).
4. **`@camp404/core` `appendTranscript`** — optional; fall back to an inline closure if it slips.
5. **Page-side preview-but-locked plumbing** — `requireClearance` (`@camp404/core`, plan 01) +
   the `page.tsx` conversion (CaptainLock plan Step 7 / service-layer 04 §EXTEND). The manager's
   `isCaptain` prop depends on this. **Service layer (broadcasts/types/actions) needs NO change.**

### Step 1 — Add the `isCaptain` prop + page-side data gating (preview-but-locked)
In `page.tsx`: remove `if (campUser.rank !== "captain") redirect("/")`. Derive
`const isCaptain = campUser.rank === "captain"`. Call `listAnnouncements()` **only when
`isCaptain`** (else pass `[]`). Pass `isCaptain` into `<AnnouncementsManager>`. Keep the
camp-access + approval redirects.
- **AC:** a member navigating to `/captains/announcements` is **not** redirected; the page
  response contains **zero** announcement rows; a captain sees the full list. (S15 OQ3 resolved:
  zero data, inert controls.)

### Step 2 — Render `CaptainLock` for non-captains in the manager
When `isCaptain === false`, the manager renders `<CaptainLock scope="surface" />` in place of
the composer + drafts + published sections (the page chrome stays). All composer/card controls
are absent (not merely disabled) under the lock.
- **AC:** member view = page chrome + `CaptainLock` "VIEW ONLY · no data for your rank"; no
  composer, no cards, no interactive control rendered; no redirect.

### Step 3 — Reconcile the page column width
Change `max-w-3xl` → the standard mobile-first column (`max-w-lg`, widening gracefully). (S15
Divergence 4 / OQ2.)
- **AC:** surface renders at the standard column at 430px; no `max-w-3xl` literal remains.

### Step 4 — Extract + re-skin the composer onto promoted molecules
Replace the inline Title `<div><Label/><Input/></div>` with `InputField`; keep `Textarea` for
the Message; extract `PresentationSelect` (the `Select` over `PRESENTATION_META`, hint `<p>`
below the trigger); swap the raw error/success `<p>`s for two `Alert`s (`destructive` /
`success`). Snap `text-emerald-400` → `success` token; remove the raw destructive `<p>`.
- **AC:** composer uses `InputField`/`Textarea`/`Select`/`Alert`; success uses the `success`
  token (no `text-emerald-400`); error is a `role="alert"` Alert; the "How it lands" hint still
  echoes the active mode; submit still disabled until trimmed title+body non-empty.

### Step 5 — Wire `DictatePill` + `RecorderPanel` on the Message body (Decision 5)
Add `dictating` state. Render `<DictatePill onActivate={() => setDictating(true)} />` in a
right-aligned `PillRow` above the Textarea; when `dictating`, mount
`<RecorderPanel onTranscript={(t) => setForm(f => ({...f, body: appendTranscript(f.body, t, 5000)}))} onDismiss={() => setDictating(false)} />`.
- **AC:** the pill appears on the Message body only (no home mic); tapping it mounts the recorder;
  "Use this text" appends the transcript (clamped to 5000, `\n`-joined); dismiss returns to the
  pill; the body remains editable. No transcription backend is added here.

### Step 6 — Extract `AnnouncementHeader` / `PresentationPill` onto `Badge`
`AnnouncementHeader` = title `<h3>` + `PresentationPill` (= `<Badge variant="soft-tint"
tone=… icon=…>{shortWord}</Badge>`, `title={hint}`). Snap the raw-hex pill tints
(`#ff008c2e`/`#00dcff26`) to Badge `tone` + status tokens (S15 Divergence 6).
- **AC:** both card types share `AnnouncementHeader`; pills render via `Badge` (no inline
  `<span>` pill, no raw hex); short-words "Acknowledge"/"Pop-up"/"Inbox" with `title` = the hint.

### Step 7 — Extract `DraftCard` / `PublishedCard` onto `Card` + `SectionHeader` + `EmptyState`
DraftCard = `Card` + `AnnouncementHeader` + body + 3 `Button`s (Edit ghost, Delete
ghost+destructive, Publish primary). PublishedCard = `Card` + `AnnouncementHeader` + body +
meta footer ("Sent to {n} member(s)" + "· by you" when `senderId === currentUserId` +
acknowledge roll-up `CheckCircle2` "{ack}/{n} acknowledged" for `acknowledge` mode only +
"Published {timestamp}"). Replace the section `<h2>`s with `SectionHeader` (count when `> 0`)
and the muted empty `<p>`s with `EmptyState variant="inline"`. Published cards stay read-only.
- **AC:** drafts get Edit/Delete/Publish; published get the meta footer + roll-up (acknowledge
  only) + timestamp and **no** mutate controls; section headers + empty states use the promoted
  molecules; all row buttons disabled while `pending`.

### Step 8 — Resolve the `feed` icon (OQ1)
Pick `inbox` (board) over `Bell` (code) in `PRESENTATION_META` (board source of truth; reads
"inbox only" literally) unless brand prefers the bell. Apply to the Select item + the pill.
- **AC:** the `feed` mode icon is consistent across the Select and the pill; decision recorded.

### Step 9 — Tests
Co-locate at `apps/web/app/captains/announcements/__tests__/` (E2E via Playwright on the
`testStore`-seeded backend, per service-layer 04; the four actions already exercise `testStore`).

| Test | Assertion |
|---|---|
| Member → preview-but-locked | non-captain sees chrome + `CaptainLock`, zero rows, no composer/controls, no redirect |
| Captain → full surface | composer + drafts + published render with real data |
| Save draft | fill title+body → "Save draft" → draft appears, composer resets, `success` Alert "Draft saved." |
| Validation guard | blank title or body → submit disabled (client); server Zod message surfaces in destructive Alert |
| Edit → Update / Cancel | Edit prefills "Edit draft"; Update saves ("Draft updated."); Cancel discards to "New announcement" |
| Delete | draft removed, "Draft deleted."; if it was being edited, composer resets |
| Publish (incl. idempotent) | draft → Published list, "Published to {n} member(s)." (singular at n=1); double-submit is a no-op |
| Pending disables all | mid-mutation, every input + every card button is disabled; submit shows spinner |
| Dictation append | RecorderPanel `onTranscript` appends (clamped, `\n`-joined); dismiss returns to pill |
| AnnouncementHeader pill | renders via `Badge`; short-word + `title=hint`; no raw hex |
| Acknowledge roll-up | shown only for `presentation="acknowledge"` published cards |
| No verbose/off-token | no `text-emerald-400`, no `max-w-3xl`, no raw-hex tints in the file |

- **AC:** suite passes via the app's vitest/Playwright runner; existing `audience`/`push`
  service tests remain green (service layer untouched).

---

## Consumers — which surfaces mount it

| Surface | Route / mount | Notes |
|---|---|---|
| **S15 Captain announcements (composer)** | `/captains/announcements` → `page.tsx` mounts `<AnnouncementsManager>` | The **only** consumer (component-library line 529 "Used by: captain announcements"; surface `15-announcements.md` §M0). Entered from Camp tools (`/captains/tools`) or direct nav; back-link returns to `/captains/tools`. |

It is **not** mounted on any other surface. The recipient-side rendering of the broadcasts it
publishes (ack-takeover `AcknowledgementGate` S25, inbox `NotificationRow` S09, `popup`
renderer + Toast) belongs to other organisms/surfaces and is out of scope here.
