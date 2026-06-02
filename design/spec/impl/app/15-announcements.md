# 15-announcements — app integration plan

- **Route(s):** `/captains/announcements` · routed page (server component, `force-dynamic`)
- **Surface brief:** [design/spec/surfaces/15-announcements.md](../../surfaces/15-announcements.md)
- **Component plans consumed:**
  - [organism-announcementsmanager.md](../components/organism-announcementsmanager.md) (the surface container; EXTEND in place)
  - [molecule-captainlock.md](../components/molecule-captainlock.md) (preview-but-locked)
  - [molecule-dictatepill.md](../components/molecule-dictatepill.md) + [molecule-recorderpanel.md](../components/molecule-recorderpanel.md) (Decision 5 voice)
  - [molecule-inputfield.md](../components/molecule-inputfield.md), [atom-textarea.md](../components/atom-textarea.md), [atom-label.md](../components/atom-label.md), [molecule-select.md](../components/molecule-select.md)
  - [atom-button.md](../components/atom-button.md), [atom-badge.md](../components/atom-badge.md), [molecule-alert.md](../components/molecule-alert.md), [molecule-sectionheader.md](../components/molecule-sectionheader.md), [molecule-card.md](../components/molecule-card.md), [molecule-emptystate.md](../components/molecule-emptystate.md)
- **Service-layer plan:** [04-broadcasts-notifications-push.md](../service-layer/04-broadcasts-notifications-push.md)
- **Architecture ref:** [architecture.md](../architecture.md) §Layering, §Phase 4 (preview-but-locked conversion)

---

## Current state

The surface **exists and works today** — all four mutations (save / update / delete / publish), edit/cancel, the drafts/published split, the presentation selector, and the delivery roll-up are live. This is an **EXTEND** integration, not a rebuild. The two structural changes the redesign makes are **gating** (hard redirect → preview-but-locked, Decision 3) and **voice** (NEW `DictatePill` on the Message body, Decision 5); everything else is a presentation re-skin onto promoted `@camp404/ui` molecules. The **service layer is REUSE-as-is** (service-layer plan 04 §"REUSE as-is": `broadcasts.ts`, the four actions, `ComposeAnnouncementInput`).

### Files today (all confirmed read)

| File | Role | Disposition |
|---|---|---|
| `apps/web/app/captains/announcements/page.tsx` (58 lines) | Server component: `dynamic = "force-dynamic"`, metadata, gating spine (lines 19–30), `listAnnouncements()` (line 32, called unconditionally), page chrome (`max-w-3xl` main, ghost `Button` back-link to `/captains/tools`, H1 + lead), mounts `<AnnouncementsManager announcements currentUserId>` | **MODIFY** — remove hard rank redirect; gate the data load; add `isCaptain` prop; narrow `max-w-3xl` → `max-w-lg` |
| `apps/web/app/captains/announcements/actions.ts` (115 lines) | `"use server"`: `requireCaptain()` gate (lines 23–40, returns `"Captain access only."` for non-captains); `saveDraftAction` / `updateDraftAction` / `deleteDraftAction` / `publishAction`, each `safeParse(ComposeAnnouncementInput)` → `lib/notifications` → `revalidatePath("/captains/announcements")`; shared `ActionResult<T>` union | **REUSE (no change)** — defence-in-depth write authority stays exactly as is (service-layer 04; CaptainLock plan §Defence-in-depth) |
| `apps/web/app/captains/announcements/announcements-manager.tsx` (394 lines) | `"use client"`: `PRESENTATION_META` (`feed → Bell`), `FormState`/`EMPTY_FORM` (default `presentation:"acknowledge"`), `useRouter`/`useState`/`useTransition`, the four handlers, the composer `<section>`, drafts/published `<section>`s, inline `AnnouncementHeader` (hand-rolled `<span>` pill) | **MODIFY** — extract + re-skin sub-components; add `isCaptain` prop + `CaptainLock`; add `dictating` state + `DictatePill`/`RecorderPanel`; swap raw error/success `<p>` → `Alert`; pill → `Badge`; sections → `SectionHeader`/`EmptyState` |

There is **no** `/api` route handler, **no** `loading.tsx`, and **no** route-scoped `error.tsx` / `not-found.tsx` / `layout.tsx` for this surface (confirmed: `apps/web/app/captains/` contains only `announcements/`, `camp-management/`, `tools/` directories — no boundary files). Route-level RSC + server-action errors fall through to the **root** `apps/web/app/error.tsx` / `apps/web/app/not-found.tsx` (confirmed present).

### What the redesign changes

1. **Gating (Decision 3 — preview-but-locked, OVERRIDES current hard redirect).** `page.tsx` today does `if (campUser.rank !== "captain") redirect("/")`. The redesign removes that redirect; a member renders the page chrome + `CaptainLock`, with **zero announcement data** and inert/absent controls. The camp-access (`/signup/required`) and approval (`/pending-approval`) redirects are **retained** — those are not the rank gate.
2. **Voice (Decision 5 — field-level dictation).** A `DictatePill` is added on the Message body (a `long_text`-class field) wired to the existing `RecorderPanel`. Neither board nor live code shows it today; Decision 5 mandates it. No home mic.
3. **Presentation re-skin.** `max-w-3xl` → `max-w-lg`; raw `text-emerald-400` success `<p>` + raw `<p text-destructive>` → `Alert` (`success` / `destructive`); hand-rolled pill `<span>` → `Badge`; section `<h2>`s → `SectionHeader`; muted empty `<p>`s → `EmptyState`; inline Title `<Label>+<Input>` → `InputField`; raw-hex pill tints → status tokens; `feed` icon `Bell` → `inbox` (OQ1, board source of truth).

---

## File structure

### Target files in `apps/web`

| File | Status vs today | Notes |
|---|---|---|
| `apps/web/app/captains/announcements/page.tsx` | **MODIFY** | Server. Remove `if (campUser.rank !== "captain") redirect("/")`. Derive `const isCaptain = campUser.rank === "captain"`. Call `listAnnouncements()` **only when `isCaptain`**, else pass `[]`. Pass `isCaptain` to the manager. `max-w-3xl` → `max-w-lg`. Keep `dynamic = "force-dynamic"`, camp-access + approval redirects, metadata. |
| `apps/web/app/captains/announcements/actions.ts` | **REUSE** | No change. `requireCaptain` + the four actions stay the write authority (defence-in-depth). |
| `apps/web/app/captains/announcements/announcements-manager.tsx` | **MODIFY** (`"use client"` island) | Add `isCaptain` prop → `CaptainLock` branch. Add `dictating` state → `DictatePill`/`RecorderPanel` sibling swap on the body. Extract `PresentationSelect` / `PresentationPill` / `DraftCard` / `PublishedCard` / `AnnouncementHeader` as in-file sub-components re-skinned onto promoted molecules. Resolve `feed` icon to `inbox`. |
| `apps/web/components/voice/recorder-panel.tsx` | **REUSE** (soft EXTEND elsewhere) | Mounted by the manager when `dictating`. Contract confirmed: `onTranscript(text: string)`, `onDismiss()`, optional `promptKey` (omitted here → generic transcription, like the bug dialog). No change required by this surface. |
| `apps/web/app/captains/announcements/__tests__/` | **CREATE** | New co-located test dir (E2E via Playwright on the `testStore`-seeded backend; the four actions already exercise `testStore`). See §Build steps. |
| `apps/web/app/error.tsx` / `apps/web/app/not-found.tsx` | **REUSE** (root) | No route-scoped boundary added. Surface errors fall through to root. No `loading.tsx` (server `force-dynamic`, no Suspense skeleton — freshness via `router.refresh()`). |

**No files DELETED for this surface.** (`dictate-button.tsx` deletion belongs to the DictatePill component plan, not this surface.) The `AnnouncementsManager` organism stays **app-local** — it is not promoted to `@camp404/ui` (it calls app-resident `"use server"` actions, uses `useRouter`/`useTransition`, and composes the browser-coupled `RecorderPanel`; AnnouncementsManager plan §mapsTo).

---

## Components composed

| Component | Plan | Render context | Where it renders |
|---|---|---|---|
| `AnnouncementsManager` | [organism-announcementsmanager.md](../components/organism-announcementsmanager.md) | **Client** (`"use client"`) | The whole interactive surface; mounted by `page.tsx` |
| `Button` (back-link, submit, Cancel edit, per-card Edit/Delete/Publish) | [atom-button.md](../components/atom-button.md) | Server (back-link in `page.tsx`) + Client (in manager) | Back-link is a ghost `Button asChild <a href="/captains/tools">`; the rest are in the manager |
| `CaptainLock` | [molecule-captainlock.md](../components/molecule-captainlock.md) | Client (in manager) | Replaces composer + lists when `isCaptain === false`; `scope="surface"` (CaptainLock plan §Consumers + Step 7) |
| `InputField` | [molecule-inputfield.md](../components/molecule-inputfield.md) | Client | Title field (`maxLength=120`, placeholder "Burn-night briefing") — replaces inline `<Label>+<Input>` |
| `Textarea` | [atom-textarea.md](../components/atom-textarea.md) | Client | Message body, used **directly** (not via `LongTextField`); `rows=6`, `maxLength=5000`, placeholder "What does everyone need to know?" |
| `Label` | [atom-label.md](../components/atom-label.md) | Client | "How it lands" label (Title/Message labels bundle into `InputField`/the textarea row) |
| `Select` (+ Trigger/Content/Item/Value) | [molecule-select.md](../components/molecule-select.md) | Client | The "How it lands" selector, wrapped by in-file `PresentationSelect` over `PRESENTATION_META`; the muted hint line below the trigger is the organism's responsibility (Select plan §Gaps) |
| `Alert` | [molecule-alert.md](../components/molecule-alert.md) | Client | Composer error banner (`tone="destructive"`, `role="alert"`, `triangle-alert`) + success banner (`tone="success"`, `check`); success suppressed when error set |
| `Badge` | [atom-badge.md](../components/atom-badge.md) | Client | The `PresentationPill` short-word badge inside `AnnouncementHeader` (with-icon variant); raw-hex tints → status tokens |
| `SectionHeader` | [molecule-sectionheader.md](../components/molecule-sectionheader.md) | Client | "Drafts (n)" / "Published (n)" headers (count only when `> 0`) |
| `Card` | [molecule-card.md](../components/molecule-card.md) | Client | Composer card + each DraftCard / PublishedCard shell |
| `EmptyState` | [molecule-emptystate.md](../components/molecule-emptystate.md) | Client | "No drafts." / "Nothing published yet." (`variant="inline"`; OQ7 reconcile from plain text) |
| `DictatePill` | [molecule-dictatepill.md](../components/molecule-dictatepill.md) | Client | Field-level voice trigger above the Message Textarea (`onActivate → setDictating(true)`); Decision 5 |
| `RecorderPanel` | [molecule-recorderpanel.md](../components/molecule-recorderpanel.md) | Client (app-local `apps/web/components/voice/recorder-panel.tsx`) | Mounted as a **sibling** of `DictatePill` when `dictating === true`; `onTranscript` → append into body; `onDismiss` → `setDictating(false)`; no `promptKey` |

**In-file sub-components** (extracted from inline markup, surface-local — not package primitives): `AnnouncementHeader` (Badge-pill + title), `PresentationSelect` (thin wrapper over `Select`), `PresentationPill` (the Badge call), `DraftCard`, `PublishedCard`.

**Server vs client split:** the **server** (`page.tsx`) owns gating + the (gated) data load + page chrome (back-link, H1, lead). The **client** (`announcements-manager.tsx`) owns everything interactive — form state, the four mutations via `useTransition`, `router.refresh()`, the `dictating` pill↔panel swap, and the `CaptainLock` render.

---

## Services & data

### Service-layer functions / server actions called

| Symbol | Source | Call site | Class |
|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts` | `page.tsx` | REUSE |
| `ensureCampUser(authUser)` | `apps/web/lib/users.ts` | `page.tsx` | REUSE |
| `hasCampAccess(campUser, email)` | `apps/web/lib/users.ts` | `page.tsx` | REUSE (→ `core` shim per architecture §Hybrid; call-site unchanged) |
| `isApproved(campUser, email)` | `apps/web/lib/users.ts` | `page.tsx` | REUSE (→ `core` shim; call-site unchanged) |
| `listAnnouncements()` | `apps/web/lib/notifications.ts` → `@camp404/db/broadcasts:117` | `page.tsx` (now **gated**: called only when `isCaptain`) | REUSE |
| `saveDraftAction(payload)` | `./actions.ts` → `createAnnouncementDraft` (`broadcasts.ts:159`) | manager `handleSave` (new mode) | REUSE → `{ id }` |
| `updateDraftAction(id, payload)` | `./actions.ts` → `updateAnnouncementDraft` (`broadcasts.ts:181`) | manager `handleSave` (editing mode) | REUSE → `boolean` |
| `deleteDraftAction(id)` | `./actions.ts` → `deleteAnnouncementDraft` (`broadcasts.ts:202`) | manager `handleDelete` | REUSE → `boolean` |
| `publishAction(id)` | `./actions.ts` → `publishAnnouncement` (`broadcasts.ts:228`) | manager `handlePublish` | REUSE → `PublishResult` `{ recipientCount }` |

`ComposeAnnouncementInput` / `AnnouncementPresentation` (`@camp404/types/announcement.ts`) and `AnnouncementSummary` (`@camp404/db/broadcasts:96-110`) are **REUSE, no shape change** (service-layer 04). The publish fan-out writes one `notification_deliveries` row per recipient (`ON CONFLICT DO NOTHING`), excluding system/sanitised accounts and the sender; recipient-side rendering (ack-gate S25, inbox S09, popup renderer) is **out of scope** here.

### `@camp404/core` helper

- **`appendTranscript(existing, addition, maxLength): string`** — pure append-not-overwrite + `\n`-joiner + clamp. The `RecorderPanel` `onTranscript` callback is `(text) => setForm(f => ({ ...f, body: appendTranscript(f.body, text, 5000) }))`. **Falls back to a short inline closure** if `@camp404/core` slips (no behaviour change). This is the only `core` helper the manager consumes; rank/clearance logic lives in the page/server layer, not this client organism (CaptainLock plan §Composition).

### Fetched server-side vs passed as props

- **Server-fetched (`page.tsx`):** `listAnnouncements()` — **gated**. A captain gets the real list; a non-captain triggers a path that **does not call** `listAnnouncements` and passes `[]` (Decision 3 "returns NO data"; service-layer 04 §EXTEND; OQ3). No other DB read on this surface.
- **Passed as props to the manager:** `announcements` (real for captain / `[]` for member), `currentUserId` (drives "· by you"), `isCaptain` (NEW — drives the `CaptainLock` branch). The manager fetches nothing client-side; the transcript is delivered by `RecorderPanel.onTranscript` (the recorder owns the `POST /api/voice/transcribe` round-trip — voice domain / S21, confirmed at `apps/web/app/api/voice/transcribe/route.ts`).

**Props after the redesign** (the one new prop is `isCaptain`):
```ts
function AnnouncementsManager({
  announcements,  // AnnouncementSummary[] — REAL for captain; [] for preview-but-locked
  currentUserId,  // string
  isCaptain,      // boolean — NEW (Decision 3); false → CaptainLock, no data
}): JSX.Element
```

---

## Gating

**Gate level: G3+rank — authed, camp-active, approved, then captain-rank-gated. This IS a rank surface → preview-but-locked applies (Decision 3).**

| Gate | Decision | Where enforced |
|---|---|---|
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` redirects to sign-in | `page.tsx` (REUSE) |
| **Invite-gated** (`!hasCampAccess`) | `redirect("/signup/required")` — **unchanged** (camp-access gate, not the rank gate) | `page.tsx` (REUSE) |
| **Pending-approval / rejected** (`!isApproved`) | `redirect("/pending-approval")` — **unchanged**; `rejected` is `isApproved=false` → same branch | `page.tsx` (REUSE) |
| **Onboarding-incomplete** | out of scope (captain surface presumes an active account); inherits global routing | global spine |
| **Preview-but-locked (member / lower rank)** | **NO redirect** (replaces `redirect("/")`). Page renders chrome (back-link, H1, lead), **does NOT call `listAnnouncements`**, passes `announcements=[]` + `isCaptain=false`. Manager renders `<CaptainLock scope="surface" />` ("VIEW ONLY · no data for your rank") in place of composer + lists; controls absent/inert; zero data | `page.tsx` (data withheld) + manager (`CaptainLock`) |
| **Captain (authorised)** | Full read/write: real `announcements`, `isCaptain=true` | `page.tsx` + manager |
| **Defence-in-depth** | Server actions still run `requireCaptain` (auth→access→approval→rank); a non-captain action returns `"Captain access only."`. Since controls are inert under CaptainLock, the action is never legitimately reachable, but the gate remains the real write authority | `actions.ts` (REUSE, unchanged) |

**Preview-but-locked treatment:** `CaptainLock`, `scope="surface"`, skin `"default"` (board S15 uses the default copy; "VIEW ONLY · no data for your rank" line per CaptainLock plan Step 7 body override). It is **not a redirect, not a blocking scrim** — it renders the surface structure (page chrome) and the lock in place of the data region, with zero announcement rows fetched. `flows.md` §3.3 invariant: dimming a populated render would be a data leak; the data is withheld server-side.

---

## States

### Content / list states
- **Empty** — Drafts `EmptyState "No drafts."`; Published `EmptyState "Nothing published yet."`; the composer always renders (for a captain).
- **Loading** — server-rendered (`force-dynamic`); **no client skeleton, no `loading.tsx`, no Suspense**. Initial load is framework navigation; freshness via `router.refresh()` after each mutation.
- **Populated** — Draft/Published cards render; `SectionHeader` shows `(count)` only when `> 0`.

### Composer form states
- **Idle (new)** — card "New announcement"; empty fields; default `presentation="acknowledge"`; submit disabled.
- **Editing** — card "Edit draft"; fields prefilled from the draft; **Cancel edit** (ghost `X`) visible; submit reads "Update draft".
- **Validation-error** — submit disabled client-side while trimmed title or body blank; server Zod messages ("Give it a title." / "Write the announcement.") surface in the destructive `Alert`.
- **Submitting / pending** — `pending` true: **all** composer inputs/buttons **and every card's row buttons** disabled; submit shows the spinning `Loader2`. Applies across the whole manager during any of the four mutations (one shared `useTransition`).
- **Success** — `tone="success"` `Alert` per action: "Draft saved." / "Draft updated." / "Draft deleted." / "Published to {n} member(s)." (singular when `n === 1`). Suppressed whenever an error is also set.
- **Action-failure** — returned `error` string in the destructive `Alert`; the op aborts, **no `router.refresh()`** (form state retained so the user can retry).
- **Disabled** — submit disabled when title/body blank or pending; row buttons disabled when pending.
- **dictating (body)** — `dictating === true` → `DictatePill` unmounts, `RecorderPanel` mounts (its own IDLE/REQUESTING/RECORDING/PROCESSING/ERROR/TranscriptResult sub-machine). The pill never co-renders with the panel; "Use this text" appends the transcript (clamped to 5000, `\n`-joined); cancelling the recorder leaves the body unchanged.

### Delivery-mode (presentation) variants — chosen at compose time
- **acknowledge** (default) — full-screen takeover recipient-side; the **only** mode that records `acknowledgedAt` and shows the "X/Y acknowledged" roll-up on the PublishedCard.
- **popup** — transient dismissable pop-up; no acknowledgement.
- **feed** — silent; lands behind the header bell only.
  (Recipient-side rendering of all three is S25/S09, not this surface.)

### Gating states (relevant here)
- **Preview-but-locked** — member view = page chrome + `CaptainLock`; zero rows; no composer; no interactive control; no redirect.
- Camp-access / approval failures → redirect (handled server-side before render).

---

## Build steps

All steps are **plan-doc-only** (no code in this pass). Ordered with prerequisites + acceptance + test notes.

### Dependency prerequisites (must land first)
1. **`foundations-tokens` Phase 0** — status tokens (`success`/`warning`/`info`), radius scale, `--text-*` + font wiring. Gates the `Alert`/`Badge`/`SectionHeader`/`EmptyState` skinning and the `text-emerald-400` → `success` swap.
2. **`@camp404/ui` promotions** — `Alert`, `Badge`, `SectionHeader`, `EmptyState`, `InputField`, `DictatePill`, `CaptainLock` built + exported (their leaf plans). `Select`/`Textarea`/`Button`/`Card`/`Label` are REUSE (already present).
3. **`CaptainLock` built** (CaptainLock plan Steps 1–4) — gates Step 2 below; depends transitively on `IconBadge` (CaptainLock plan Step 0).
4. **`DictatePill` built** (DictatePill plan Steps 1–2) — gates Step 5. `RecorderPanel` is REUSE (its `onTranscript`/`onDismiss` contract is unchanged; soft prerequisite that the `TranscriptResult` review state lands).
5. **`@camp404/core` `requireClearance` + `appendTranscript`** (architecture §Phase 1/3, plan 01) — `requireClearance` backs the page rank decision (the simple `campUser.rank === "captain"` check is acceptable as the shim until then); `appendTranscript` is optional with an inline fallback.
6. **Service layer needs NO change** — `broadcasts.ts`, `ComposeAnnouncementInput`, and the four actions are REUSE-as-is (service-layer 04 §"REUSE as-is").

### Step 1 — Convert `page.tsx` to preview-but-locked + gate the data load
Remove `if (campUser.rank !== "captain") redirect("/")`. Derive `const isCaptain = campUser.rank === "captain"`. Call `listAnnouncements()` **only when `isCaptain`**; otherwise pass `announcements={[]}`. Pass `isCaptain` to `<AnnouncementsManager>`. Keep `dynamic = "force-dynamic"`, metadata, and the camp-access + approval redirects.
- **Prereq:** none (`CaptainLock` render is Step 2; this step is the server-side data gate).
- **AC:** a member navigating to `/captains/announcements` is **not** redirected; the page response contains **zero** announcement rows; a captain sees the full list. (OQ3 resolved: zero data, inert controls.)

### Step 2 — Render `CaptainLock` for non-captains in the manager
Add the `isCaptain` prop. When `isCaptain === false`, the manager renders `<CaptainLock scope="surface" />` in place of the composer + drafts + published sections (page chrome stays). All composer/card controls are **absent** (not merely disabled) under the lock.
- **Prereq:** `CaptainLock` built (prereq 3); Step 1.
- **AC:** member view = page chrome + `CaptainLock` "VIEW ONLY · no data for your rank"; no composer, no cards, no interactive control rendered; no redirect.

### Step 3 — Reconcile the page column width
`max-w-3xl` → `max-w-lg` (standard mobile-first column, widening gracefully). (S15 Divergence 4 / OQ2 / open-questions B22.)
- **AC:** surface renders at the standard column at 430px; no `max-w-3xl` literal remains.

### Step 4 — Extract + re-skin the composer onto promoted molecules
Replace the inline Title `<div><Label/><Input/></div>` with `InputField`; keep `Textarea` for the Message; extract `PresentationSelect` (the `Select` over `PRESENTATION_META`, with the muted hint `<p>` below the trigger); swap the raw error/success `<p>`s for two `Alert`s (`destructive` / `success`); snap `text-emerald-400` → `success` token.
- **Prereq:** `Alert`/`InputField`/`Select` available (prereq 2); Phase 0 tokens.
- **AC:** composer uses `InputField`/`Textarea`/`Select`/`Alert`; success uses the `success` token (no `text-emerald-400`); error is a `role="alert"` Alert; the "How it lands" hint still echoes the active mode; submit still disabled until trimmed title+body non-empty.

### Step 5 — Wire `DictatePill` + `RecorderPanel` on the Message body (Decision 5)
Add `dictating` state. Render `<DictatePill onActivate={() => setDictating(true)} />` in a right-aligned PillRow above the Textarea; when `dictating`, mount `<RecorderPanel onTranscript={(t) => setForm(f => ({...f, body: appendTranscript(f.body, t, 5000)}))} onDismiss={() => setDictating(false)} />` (no `promptKey` → generic transcription). Disable the pill while pending.
- **Prereq:** `DictatePill` built (prereq 4); `appendTranscript` (prereq 5, inline fallback OK).
- **AC:** the pill appears on the Message body only (no home mic); tapping it mounts the recorder; "Use this text" appends the transcript (clamped to 5000, `\n`-joined); dismiss returns to the pill; the body remains editable; no transcription backend added here.

### Step 6 — Extract `AnnouncementHeader` / `PresentationPill` onto `Badge`
`AnnouncementHeader` = title `<h3>` + `PresentationPill` (= `<Badge>` with-icon, `tone` + status token, `title={hint}`). Snap raw-hex pill tints (`#ff008c2e` / `#00dcff26`) to `Badge tone` + status tokens (S15 Divergence 6 / open-questions B6).
- **AC:** both card types share `AnnouncementHeader`; pills render via `Badge` (no inline `<span>` pill, no raw hex); short-words "Acknowledge"/"Pop-up"/"Inbox" with `title` = the hint.

### Step 7 — Extract `DraftCard` / `PublishedCard` onto `Card` + `SectionHeader` + `EmptyState`
DraftCard = `Card` + `AnnouncementHeader` + body + 3 `Button`s (Edit ghost, Delete ghost+destructive, Publish primary). PublishedCard = `Card` + `AnnouncementHeader` + body + meta footer ("Sent to {n} member(s)" + "· by you" when `senderId === currentUserId` + acknowledge roll-up `CheckCircle2` "{ack}/{n} acknowledged" for `acknowledge` mode only + "Published {timestamp}"). Replace section `<h2>`s with `SectionHeader` (count when `> 0`) and muted empty `<p>`s with `EmptyState variant="inline"`. Published cards stay read-only.
- **AC:** drafts get Edit/Delete/Publish; published get the meta footer + roll-up (acknowledge only) + timestamp and **no** mutate controls; section headers + empty states use the promoted molecules; all row buttons disabled while `pending`.

### Step 8 — Resolve the `feed` icon (OQ1 / open-questions B21)
Pick `inbox` (board) over `Bell` (code) in `PRESENTATION_META` (board source of truth; reads "inbox only" literally) unless brand prefers the bell. Apply to the Select item + the pill.
- **AC:** the `feed` mode icon is consistent across the Select and the pill; decision recorded.

### Step 9 — Tests
Co-locate at `apps/web/app/captains/announcements/__tests__/` (E2E via Playwright on the `testStore`-seeded backend — the four actions already exercise `testStore`; the **E2E_TEST_MODE seam** routes `lib/notifications` to `testStore` when `isE2ETestMode()`, so seed drafts/published deliveries through it rather than live Neon).

| Test | Assertion |
|---|---|
| Member → preview-but-locked | non-captain sees chrome + `CaptainLock`, zero rows, no composer/controls, **no redirect** |
| Captain → full surface | composer + drafts + published render with real data |
| Save draft | fill title+body → "Save draft" → draft appears, composer resets, `success` Alert "Draft saved." |
| Validation guard | blank title or body → submit disabled (client); server Zod message surfaces in destructive Alert |
| Edit → Update / Cancel | Edit prefills "Edit draft"; Update saves ("Draft updated."); Cancel discards to "New announcement" |
| Delete | draft removed, "Draft deleted."; if it was being edited, composer resets |
| Publish (incl. idempotent) | draft → Published list, "Published to {n} member(s)." (singular at n=1); double-submit is a no-op |
| Pending disables all | mid-mutation, every input + every card button is disabled; submit shows spinner |
| Dictation append | RecorderPanel `onTranscript` appends (clamped, `\n`-joined); dismiss returns to pill; cancel leaves body unchanged |
| AnnouncementHeader pill | renders via `Badge`; short-word + `title=hint`; no raw hex |
| Acknowledge roll-up | shown only for `presentation="acknowledge"` published cards |
| No off-token regressions | no `text-emerald-400`, no `max-w-3xl`, no raw-hex tints in the file |

- **AC:** suite passes via the app's vitest/Playwright runner; existing `audience`/`push` service tests remain green (service layer untouched). Each step lands as an **independently CI-green** change (MEMORY: green-CI-is-done) — do not strand post-green follow-ups; the gating conversion (Steps 1–2) and the voice wiring (Step 5) are each self-contained, shippable changes.

---

## Open items

Cross-referenced from [design/spec/surfaces/15-announcements.md](../../surfaces/15-announcements.md) §Open questions and [design/spec/open-questions.md](../../open-questions.md).

1. **OQ1 / B21 — `feed` icon.** `inbox` (board) vs `Bell` (code). Lean to `inbox` (board source of truth, reads "inbox only" literally). Design call (low). Resolved in Step 8.
2. **OQ2 / B22 — Layout width.** Confirm `max-w-lg` is the target (reconciling `max-w-3xl` away); whether any wider desktop max-width is wanted. Design call (med). Resolved in Step 3.
3. **OQ3 / D26 — Preview-but-locked data behaviour.** Confirm a non-captain sees **zero** announcement rows (empty lists under CaptainLock) vs structure-only placeholder rows. **This plan assumes zero data, inert controls** (Decision 3 "returns NO data"). Product call (low). Resolved in Step 1.
4. **OQ4 — `DictatePill`/`RecorderPanel` reuse.** Confirm the body field is classified `long_text` for the dictation affordance and that the shared `RecorderPanel` is the source (Decision 5; open-questions B14). No transcription backend is specced here (the recorder owns `POST /api/voice/transcribe`). eng/design (med).
5. **OQ5 / D24 — `channel` toggle.** `channel` is fixed to `both` (DB default; composer never sets it). Confirm the composer should expose **no** push/in-app channel toggle (scoped/scheduled channel control lives with the push UIs). Product call (low).
6. **OQ6 / D25 — No unpublish / recall / republish.** By design, captains cannot retract a published announcement (only author a fresh one); the owned-draft predicate's `publishedAt IS NULL` also blocks server-side mutation. Confirm acceptable. Product call (low).
7. **OQ7 / B18 — EmptyState reuse.** Board draws plain muted text for "No drafts."/"Nothing published yet."; this plan adopts the canvas `EmptyState` (`variant="inline"`). Confirm vs keeping inline copy. Design call (low). Resolved in Step 7.
8. **B6 — Captain colour token.** Express the Acknowledge/captain pill fill as `$accent / ~15%` (not raw `#00dcff26` / `#ff008c2e`); confirm `$accent` is the right semantic for "captain" everywhere. Design call (med). Resolved in Step 6.
