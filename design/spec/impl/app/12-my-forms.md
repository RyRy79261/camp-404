# 12-my-forms — app integration plan

- **Route(s):** `/tools/forms` (list) · `/tools/forms/[key]` (detail / replay) · routed page
- **Surface brief:** `design/spec/surfaces/12-my-forms.md`
- **Rank gate:** none — open to any approved member

---

## Current state — existing route/files today

Both routes and their supporting files already exist and ship to production. The surface is **not** new — it is a redesign of a working implementation.

### List page — `apps/web/app/tools/forms/page.tsx`

Server component (`force-dynamic`). Gate chain (lines 28–39): `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` else `/signup/required` → `getBurnerProfile.completedAt` else `/onboarding/questionnaire` → `isApproved` else `/pending-approval`. Calls `listCompletedForms(campUser.id)`.

**Current markup diverges from the spec in four ways:**

| Gap | Live (today) | Spec (`12-my-forms.md`) |
|---|---|---|
| Empty state | `<p className="rounded-lg border border-dashed p-6 text-center text-sm text-[color:var(--color-muted-foreground)]">You haven't completed any forms yet.</p>` (no icon, no heading) | `<EmptyState variant="full" heading="No forms yet" body="You haven't completed any forms yet." />` (molecule, board 08) |
| FormCard | `<Card>` + `<CardHeader>` + `<CardTitle>` + `<CardDescription>` via `@camp404/ui/components/card`; `Link` wraps the whole card | Bespoke `FormCard` component (`gap:14 pad:18 r:$radius fill:$card stroke:$border`) — tappable, contains text block + `chevron-right` icon |
| GhostBack | `<Link href="/tools" className="mb-6 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"><ChevronLeft className="h-4 w-4" />Tools</Link>` (lines 45–51) — raw `Link`, verbose token classes, 16px icon, 14px label | `<GhostBack label="Tools" href="/tools" />` — promoted molecule, 15px Inter/500, 20px icon, `pad:[14,12]` |
| Token encoding | Verbose `text-[color:var(--color-muted-foreground)]` / `bg-[color:var(--color-card)]` forms throughout | Short-form `text-muted-foreground` / `bg-card` per redesign token-spelling rec |

### Detail page — `apps/web/app/tools/forms/[key]/page.tsx`

Server component (`force-dynamic`). Same gate chain as the list (lines 30–42) plus: `getReplayableForm(key)` → `notFound()` if missing; `form.load(campUser.id)` → redirect `/tools/forms` if `!state.completedAt`; `listFormEdits(campUser.id, form.key)`.

Renders `<FormReplay>` (client island) and a co-located `ChangeLog` function component (server-renderable, defined inline in the same file at lines 84–126).

**Current markup diverges from spec:**

| Gap | Live (today) | Spec |
|---|---|---|
| GhostBack | Same raw `Link` pattern as list page (lines 58–64) | `<GhostBack label="My forms" href="/tools/forms" />` |
| SavedBanner | Does not exist — the `saved` state is local to `form-replay.tsx` but no banner renders outside the wizard in the page shell; the current live banner is inside `<FormReplay>` (lines 35–42 of `form-replay.tsx`) using `CheckCircle2` + raw token classes | The spec separates `SavedBanner` as a `role="status"` strip in the page layout at the `<FormReplay>` level, with `circle-check-big` icon (not `CheckCircle2`), `fill:#00dcff26` tint, `$accent` icon colour |
| ChangeLog empty state | `<p className="mt-4 text-sm text-[color:var(--color-muted-foreground)]">No edits yet…</p>` (plain `<p>`) | `<EmptyState variant="inline" body="No edits yet. Changes you make here will show up in this list." />` |
| ChangeLog populated | `<ol>` / `<li>` with `rounded-lg border bg-[color:var(--color-card)] p-4` and raw token verbose classes | Spec: `pad:14 r:$radius fill:$card stroke:$border gap:6`; field rows with from-arrow-to diff layout; timestamp at `Inter 11/500 $muted-foreground` |
| `ChangeLog` placement | Inline `function ChangeLog(…)` in `page.tsx` | Promote to a named exported component in `apps/web/app/tools/forms/[key]/change-log.tsx` (server-renderable) |
| Token encoding | Multiple `text-[color:var(--color-*)]` verbose forms | Short-form throughout |

### Client island — `apps/web/app/tools/forms/[key]/form-replay.tsx`

`"use client"`. Holds `saved` state + `router.refresh()` on `onComplete`. Mounts `<QuestionnaireWizard persistProgress={false} submitLabel="Save changes" action={saveFormReplay} onComplete={…} />`. The `saved` banner renders inside this component today (lines 35–42). Divergence: `CheckCircle2` (live) vs `circle-check-big` (spec); raw token classes; banner inside the island rather than lifted to page layout.

### Server action — `apps/web/app/tools/forms/[key]/actions.ts`

`"use server"`. `saveFormReplay(key, rawResponses, final)`: auth+`hasCampAccess` gate → `getReplayableForm` → `validateResponses` → `diffResponses` (filtering `ID_NUMBER_KEY`) → `form.save` → `recordFormEdit` (if `changes.length > 0`) → `revalidatePath`. Functionally correct. Divergence: import of `QUESTIONNAIRE` (now moving to `@camp404/core`); after the Phase 3 extraction the import path for the catalogue shifts.

### App-lib orchestration — `apps/web/lib/forms.ts`

`server-only`. `REGISTRY`, `BURNER_PROFILE` entry, `getReplayableForm`, `listCompletedForms`, `FormEdit`, `recordFormEdit`, `listFormEdits`. E2E-test-store aware. **Known data-integrity issue:** `BURNER_PROFILE.save` calls `upsertBurnerProfile({ …, markComplete: true })` with the comment "idempotent on completedAt" (line 79), but the SQL in `packages/db/src/burner-profile.ts` sets `completed_at = now()` unconditionally (db plan 03, Step 3). This must be fixed in `packages/db` before this surface is complete. No code change in `lib/forms.ts` is needed for that fix, only an update to the stale comment at line 78–80.

---

## File structure — target files in apps/web

### `/tools/forms` (list page)

| File | Status | Notes |
|---|---|---|
| `apps/web/app/tools/forms/page.tsx` | **MODIFY** | Replace inline GhostBack with `<GhostBack>`, replace inline empty state with `<EmptyState variant="full">`, replace Card-based FormCard with new `<FormCard>` component; remove verbose `text-[color:var(--color-*)]` classes |
| `apps/web/app/tools/forms/form-card.tsx` | **CREATE** | New server-renderable presentational component for the tappable card row; `"use client"` not needed — pure Link + markup |

### `/tools/forms/[key]` (detail / replay page)

| File | Status | Notes |
|---|---|---|
| `apps/web/app/tools/forms/[key]/page.tsx` | **MODIFY** | Replace inline GhostBack with `<GhostBack>`, pass `saved` prop down to `<FormReplay>` (or lift `SavedBanner` into the page shell driven by a URL param / search param approach — see Gating), import `ChangeLog` from its own file, remove verbose token classes |
| `apps/web/app/tools/forms/[key]/form-replay.tsx` | **MODIFY** | Remove the inline banner (move `SavedBanner` to a separate component); keep `saved` state + `onComplete`; pass `saved` state up to page (via prop callback or sibling component re-render approach — see Open items §1) |
| `apps/web/app/tools/forms/[key]/saved-banner.tsx` | **CREATE** | New client component for the `role="status"` confirmation strip; receives `visible: boolean`; uses `CircleCheckBig` (lucide `circle-check-big`) icon + `$accent` colour |
| `apps/web/app/tools/forms/[key]/change-log.tsx` | **CREATE** | Extract the inline `ChangeLog` function from `page.tsx` into a named export; server-renderable; composed of `ChangeLogEntry` sub-component and `<EmptyState variant="inline">` for the empty branch |
| `apps/web/app/tools/forms/[key]/actions.ts` | **MODIFY** | Import path for catalogue (`QUESTIONNAIRE`) shifts `@/lib/questionnaire` → `@camp404/core` after Phase 3 extraction; no logic change |

### Shared / not changed

| File | Status | Notes |
|---|---|---|
| `apps/web/lib/forms.ts` | **MODIFY (minor)** | Update stale idempotency comment at lines 78–80 after the `upsertBurnerProfile` COALESCE fix lands in `packages/db` (Phase 2b); no API or logic change |
| `apps/web/app/tools/forms/[key]/actions.ts` | **MODIFY (minor)** | Import re-point only (Phase 3 extraction) |

### No new `/api` route handlers, no `error.tsx` or `not-found.tsx` additions needed

The 404 case is covered by `notFound()` in `page.tsx` (already present, line 45 of the detail page). A `not-found.tsx` at `apps/web/app/tools/forms/[key]/not-found.tsx` is **CREATE (optional)** — the global `not-found.tsx` covers this if a surface-specific custom 404 message is not required. No server errors require a new `error.tsx` boundary beyond the global one already in the app.

---

## Components composed

### List page (`/tools/forms`)

| Component | Plan | Status | Renders | Notes |
|---|---|---|---|---|
| `GhostBack` | [`molecule-ghostback.md`](../components/molecule-ghostback.md) | PROMOTE (from inline) | Server | `label="Tools"` `href="/tools"` `variant="default"` |
| `FormCard` | (new, this surface) | NEW | Server | Tappable card row; `title`, `description`, `lastEdited: Date`, `href`; lives at `apps/web/app/tools/forms/form-card.tsx` |
| `EmptyState` | [`molecule-emptystate.md`](../components/molecule-emptystate.md) | PROMOTE (from inline `<p>`) | Server | `variant="full"` `heading="No forms yet"` `body="You haven't completed any forms yet."` |

### Detail / replay page (`/tools/forms/[key]`)

| Component | Plan | Status | Renders | Notes |
|---|---|---|---|---|
| `GhostBack` | [`molecule-ghostback.md`](../components/molecule-ghostback.md) | PROMOTE (from inline) | Server | `label="My forms"` `href="/tools/forms"` |
| `SavedBanner` | (new, this surface) | NEW | Client (island within `FormReplay`) | `visible: boolean`; `role="status"`; `CircleCheckBig` icon; `fill:#00dcff26 stroke:$border r:$radius` |
| `FormReplay` | (this surface) | MODIFY | Client (`"use client"`) | Thin shell wrapping `QuestionnaireWizard`; holds `saved` state; passes `onComplete` callback |
| `QuestionnaireWizard` | [`organism-questionnairewizard.md`](../components/organism-questionnairewizard.md) | REUSE / EXTEND | Client (inside `FormReplay`) | `variant="replay"` `persistProgress={false}` `submitLabel="Save changes"` `action={saveFormReplay}` `onComplete={…}` |
| `ChangeLog` | (new, extracted from inline) | CREATE | Server | Extracted component; takes `edits: FormEdit[]`; composes `ChangeLogEntry` × N and `<EmptyState variant="inline">` |
| `ChangeLogEntry` | (sub-component of ChangeLog) | CREATE | Server | Single edit-session card; `edit: FormEdit`; timestamp + per-field diff rows |
| `EmptyState` (inline variant) | [`molecule-emptystate.md`](../components/molecule-emptystate.md) | PROMOTE (from bare `<p>`) | Server | `variant="inline"` `body="No edits yet. Changes you make here will show up in this list."` — the EmptyLog |

**Lucide icons used (kebab → PascalCase import):**
- `chevron-left` → `ChevronLeft` (inside `GhostBack`, already present)
- `chevron-right` → `ChevronRight` (inside `FormCard`)
- `circle-check-big` → `CircleCheckBig` (inside `SavedBanner`; replaces the live `CheckCircle2`)

---

## Services & data

### Server-side (fetched before render, passed as props)

| Call | Location | Returns | Who calls it |
|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `@/lib/auth` | `authUser` or redirect | `page.tsx` (both routes) |
| `ensureCampUser(authUser)` | `@/lib/users` | `campUser` | `page.tsx` (both routes) |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `@/lib/users` (shim → `@camp404/core` post Phase 3) | `boolean` | `page.tsx` (both routes) |
| `getBurnerProfile(campUser.id)` | `@/lib/users` | `BurnerProfile \| null` | `page.tsx` (both routes; `.completedAt` gate) |
| `isApproved(campUser, authUser.primaryEmail)` | `@/lib/users` (shim → `@camp404/core` post Phase 3) | `boolean` | `page.tsx` (both routes) |
| `listCompletedForms(campUser.id)` | `@/lib/forms` | `CompletedFormSummary[]` | List `page.tsx` |
| `getReplayableForm(key)` | `@/lib/forms` | `ReplayableForm \| undefined` | Detail `page.tsx` |
| `form.load(campUser.id)` | `@/lib/forms` → `getBurnerProfile` + `getIdDocuments` + `mergeIdNumber` | `{ responses, completedAt, updatedAt } \| null` | Detail `page.tsx` |
| `listFormEdits(campUser.id, form.key)` | `@/lib/forms` (E2E-test-store aware) → `listQuestionnaireEdits` (`@camp404/db/questionnaire-edits`) | `FormEdit[]` (capped at 20) | Detail `page.tsx` |

All fetches are **awaited server-side** before the page renders. No client-side data fetching. The detail page passes `form.questionnaire` (static `Questionnaire` catalogue), `state.responses` (pre-seeded), `form.key`, and `edits` as serialisable props to `<FormReplay>` and `<ChangeLog>`.

### Server action (called from the client wizard)

| Symbol | Location | Gate | Logic |
|---|---|---|---|
| `saveFormReplay(key, rawResponses, final)` | `apps/web/app/tools/forms/[key]/actions.ts` | `getAuthenticatedUserOrRedirect` + `hasCampAccess` (re-checked per action; NOT onboarding/approval gate) | `final=false` → early `{ok:true}` (wizard never sends `false` when `persistProgress=false`, but guard stays); `final=true` → `validateResponses` → `diffResponses` (filter `ID_NUMBER_KEY`) → `form.save` → `recordFormEdit` (if changes) → `revalidatePath` × 2 → `{ok:true}` |

`form.save` internally calls (via `BURNER_PROFILE.save` in `lib/forms.ts`):
- `upsertBurnerProfile` (`@camp404/db` via `@/lib/users`, **EXTEND** for COALESCE fix — Phase 2b)
- `setIdDocuments` (encrypt, `@/lib/users`)
- `satisfyBurnerProfileAction` (gate satisfaction, `@/lib/users`)

`recordFormEdit` routes through `testStore` under `E2E_TEST_MODE`, otherwise calls `recordQuestionnaireEdit` from `@camp404/db/questionnaire-edits`.

### `@camp404/core` helpers (post Phase 3 extraction)

After the Phase 3 catalogue extraction lands, the following import paths shift (no logic change):
- `actions.ts`: `QUESTIONNAIRE` ref is indirect (via `form.questionnaire` from the registry) — no direct import of the catalogue in `actions.ts`; **no import change needed here**.
- `lib/forms.ts` line 13: `import { QUESTIONNAIRE } from "./questionnaire"` → `import { QUESTIONNAIRE } from "@camp404/core"`. This is a Phase 3 task, not a 12-my-forms task, but it unblocks the final import-hygiene step for this surface.

---

## Gating

**No rank gate on this surface.** My forms is open to any fully approved member. The `CaptainLock` molecule and preview-but-locked treatment (decision #3) do **not** apply here.

### Gate chain (both pages)

```
getAuthenticatedUserOrRedirect()
  └─ unauthenticated → redirect to sign-in
ensureCampUser(authUser)
hasCampAccess(campUser, authUser.primaryEmail)
  └─ false → redirect("/signup/required")
getBurnerProfile(campUser.id).completedAt
  └─ falsy → redirect("/onboarding/questionnaire")
isApproved(campUser, authUser.primaryEmail)
  └─ false → redirect("/pending-approval")
```

### Detail page additional gates (after the shared chain)

```
getReplayableForm(key)
  └─ undefined → notFound()  [→ 404]
form.load(campUser.id).completedAt
  └─ falsy → redirect("/tools/forms")  [incomplete form: back to list]
```

### Save action gate (lighter — re-checks auth + access only)

```
getAuthenticatedUserOrRedirect()
hasCampAccess(campUser, authUser.primaryEmail)
  └─ false → redirect("/signup/required")
getReplayableForm(key)
  └─ undefined → { ok:false, errors:{ _root:"Unknown form." } }
```

Onboarding and approval are **not** re-checked inside `saveFormReplay`. Page-level gates are the primary enforcement; the action only defends against an invite-revocation mid-session.

---

## States

### List page

| State | Display |
|---|---|
| **Populated** | `FormCard` × N — one per `CompletedFormSummary`; "Last edited {date}" = `updatedAt ?? completedAt` formatted `en-ZA` medium+short |
| **Empty** | `<EmptyState variant="full" heading="No forms yet" body="You haven't completed any forms yet." />` |
| **Loading** | Server-rendered; no in-page spinner; `force-dynamic` awaits all fetches before HTML is sent |
| **Gate failure** | Any gate fires a `redirect()` before render; the page never renders a gated state (no `CaptainLock`) |

### Detail page

| State | Display |
|---|---|
| **Initial load** | Intro (form title + "Last edited {date}"), pre-filled wizard (Back disabled on page 1), ChangeLog (entries or EmptyState inline), **no SavedBanner** |
| **Wizard in progress** | Local state only (`persistProgress=false`); no server calls until final submit |
| **Submitting** | Wizard: Back + Submit disabled (`isPending`), Submit label "Save changes" stays (not changed to "Saving…" in the current wizard — per `organism-questionnairewizard.md` the replay variant does not flip the label; confirm in Step 4 of that plan) |
| **Validation error (field)** | Per-field message under the field (`QuestionField` handles this) |
| **Validation error (form-level)** | `_form`/`_root` → `Alert` molecule banner inside the wizard (redesigned in Step 3 of the wizard plan) |
| **Success** | `SavedBanner` visible (`role="status"`); `router.refresh()` re-renders server component → ChangeLog gains new entry (if changes existed) |
| **No-op replay** | `SavedBanner` still shows (the action returned `{ok:true}`); ChangeLog unchanged (no new entry written because `changes.length === 0`) |
| **Unknown key** | `notFound()` → 404; save action returns `{ ok:false, errors:{ _root:"Unknown form." } }` |
| **Incomplete form loaded** | `redirect("/tools/forms")` — never reaches the render |

### ChangeLog states

| State | Display |
|---|---|
| **Empty** | `<EmptyState variant="inline" body="No edits yet. Changes you make here will show up in this list." />` |
| **Populated** | `ChangeLogEntry` cards, most-recent-first, capped at 20; each card shows timestamp (Inter 11/500 `$muted-foreground`) + per-field diff rows (field label `Inter 14/700 $foreground`; from `$muted-foreground` · arrow "→" `$muted-foreground` · to `$foreground 500`); empty/unanswered values display as em dash "—" |

---

## Build steps

Ordered by dependency. Each step must be independently CI-green before the next begins (MEMORY: green-CI-is-done).

### Prerequisites (must land before any step below)

| Prerequisite | Plan | Phase |
|---|---|---|
| Foundation tokens (`success`/`warning`/`info`, `--overlay`, radius scale, `--text-*`, `font-*`) | `foundations-tokens.md` | Phase 0 |
| `@camp404/ui` `GhostBack` PROMOTE | `molecule-ghostback.md` Steps 1–4 | Phase 5 |
| `@camp404/ui` `EmptyState` PROMOTE | `molecule-emptystate.md` Steps 1–4 | Phase 5 |
| `@camp404/ui` `IconBadge` PROMOTE (EmptyState dep) | `atom-iconbadge.md` | Phase 5 |
| `QuestionnaireWizard` Step 2 (swap ProgressBar atom) | `organism-questionnairewizard.md` | Phase 5 |
| `QuestionnaireWizard` Step 3 (swap Alert molecule) | `organism-questionnairewizard.md` | Phase 5 |
| `upsertBurnerProfile` COALESCE fix | `03-questionnaire-forms.md` Step 3 | Phase 2b |

---

### Step 1 — Create `FormCard` component

**File:** `apps/web/app/tools/forms/form-card.tsx` (CREATE)

Implement a server-renderable presentational component:
- Props: `{ title: string; description: string; lastEdited: Date; href: string }`
- Root: `<Link href={href}>`; inner `<div className="flex items-start justify-between gap-3.5 rounded-[--radius] border bg-card p-[18px]">` (board `pad:18 r:$radius fill:$card stroke:$border`)
- Text block: title (`Inter 14/700 $foreground` or `text-sm font-bold`), description (`text-sm text-muted-foreground`), "Last edited {dateFmt.format(lastEdited)}" (`text-xs text-muted-foreground`)
- Trailing: `<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />`
- No `"use client"` — static markup
- **Acceptance:** renders with correct layout; `href` navigates; `ChevronRight` present; no raw hex; no `text-[color:var(--color-*)]` verbose form; `pnpm --filter apps/web typecheck` green

---

### Step 2 — Create `SavedBanner` component

**File:** `apps/web/app/tools/forms/[key]/saved-banner.tsx` (CREATE)

`"use client"` not needed — receives `visible: boolean` as a prop from the client island.

- Props: `{ visible: boolean }`
- When `!visible`: renders `null` (or `hidden` with `aria-hidden` — null is cleaner)
- When `visible`: `<div role="status" className="flex items-center gap-2.5 rounded-[--radius] border bg-[#00dcff26] px-3.5 py-3.5 text-sm">` — note `fill:#00dcff26` is a spec-prescribed raw hex tint for the accent wash; document this as an exception pending an `--accent-subtle` status token (open item §2 below)
- Icon: `<CircleCheckBig className="h-4 w-4 shrink-0 text-accent" aria-hidden />`
- Text: `<span className="text-foreground">Saved. Your answers — and the change log below — are up to date.</span>` (`Inter 13/normal $foreground` per spec)
- **Acceptance:** `role="status"` present; `CircleCheckBig` used (not `CheckCircle2`); hidden when `visible=false`; accessible to screen readers on state change

---

### Step 3 — Create `ChangeLog` and `ChangeLogEntry` components

**File:** `apps/web/app/tools/forms/[key]/change-log.tsx` (CREATE)

Extract the inline `ChangeLog` function from `page.tsx` (lines 84–126) into a named export and bring it to spec:

`ChangeLogEntry` sub-component (can be co-located in the same file):
- Props: `{ edit: FormEdit }` (import `FormEdit` from `@/lib/forms`)
- Root: `<li className="rounded-[--radius] border bg-card p-3.5">` (board `pad:14 r:$radius fill:$card stroke:$border gap:6`)
- Timestamp: `<p className="text-[11px] font-medium text-muted-foreground">{dateFmt.format(edit.createdAt)}</p>`
- Per-field rows: `<ul>` → `<li>` for each `change` in `edit.changes`:
  - Field label: `<span className="text-sm font-bold text-foreground">{change.label}</span>` (`Inter 14/700 $foreground`)
  - Diff row: `<span className="text-muted-foreground">{change.from || "—"}</span>` · `<span aria-hidden className="text-muted-foreground">→</span>` · `<span className="font-medium text-foreground">{change.to || "—"}</span>`

`ChangeLog` exported component:
- Props: `{ edits: FormEdit[] }`
- Heading: `<h2 className="text-[17px] font-bold text-foreground">Change log</h2>` (`Inter 17/700 $foreground`)
- Intro: `<p className="text-[13px] text-muted-foreground">…</p>`
- Branch: `edits.length === 0` → `<EmptyState variant="inline" body="No edits yet. Changes you make here will show up in this list." />`
- Populated: `<ol className="flex flex-col gap-4">` of `<ChangeLogEntry>` items

**Acceptance:** `ChangeLog` exported; existing inline function removed from `page.tsx`; empty branch uses `EmptyState variant="inline"` (not bare `<p>`); populated branch renders diff rows with `→` separator; `dateFmt` shared or re-declared (do not import from `page.tsx` — declare locally or move to a shared `date-format.ts` helper in the same directory); TypeScript green.

---

### Step 4 — Modify `form-replay.tsx` — lift SavedBanner, wire `CircleCheckBig`

**File:** `apps/web/app/tools/forms/[key]/form-replay.tsx` (MODIFY)

- Remove the inline banner (lines 35–42: `{saved && <div role="status" …>}`)
- Remove `CheckCircle2` import
- Import and render `<SavedBanner visible={saved} />` above the `<QuestionnaireWizard>` (or pass `saved` up — see Open items §1 for the architectural option)
- Add `variant="replay"` prop to `<QuestionnaireWizard>` once the wizard's `variant` prop lands (wizard Step 4 prereq); until then, the current props are spec-correct
- **Acceptance:** `CheckCircle2` removed; `SavedBanner` used; `role="status"` present after save; `router.refresh()` still fires; `saved` state still held in this island; TypeScript green

---

### Step 5 — Modify list `page.tsx` — wire GhostBack, FormCard, EmptyState

**File:** `apps/web/app/tools/forms/page.tsx` (MODIFY)

- Remove lines 45–51 (raw `Link` back affordance), import `GhostBack`, render `<GhostBack label="Tools" href="/tools" className="mb-6" />`
- Remove `ChevronLeft` import (no longer used directly)
- Replace `ChevronRight` import (moves to `form-card.tsx`)
- Remove `Card`/`CardHeader`/`CardTitle`/`CardDescription` imports
- Replace the `forms.map(…)` `<Link><Card>…</Card></Link>` block with `forms.map((form) => <FormCard key={form.key} title={form.title} description={form.description} lastEdited={form.updatedAt ?? form.completedAt} href={`/tools/forms/${form.key}`} />)`
- Replace the empty-state `<p className="rounded-lg border border-dashed p-6 …">` with `<EmptyState heading="No forms yet" body="You haven't completed any forms yet." />`
- Remove all `text-[color:var(--color-muted-foreground)]` verbose token usages; replace with short-form `text-muted-foreground`
- Keep `dateFmt` (still needed) — actually move it into `FormCard` since the list page no longer formats dates; remove from `page.tsx` if unused
- **Acceptance:** list page renders `FormCard` × N or `EmptyState`; back link navigates to `/tools`; no `Card` imports remain; no verbose `text-[color:var(…)]` classes; `pnpm build` green

---

### Step 6 — Modify detail `page.tsx` — wire GhostBack, ChangeLog, SavedBanner visibility

**File:** `apps/web/app/tools/forms/[key]/page.tsx` (MODIFY)

- Remove lines 58–64 (raw `Link` back affordance), import `GhostBack`, render `<GhostBack label="My forms" href="/tools/forms" className="mb-6" />`
- Remove `ChevronLeft` import
- Import `ChangeLog` from `./change-log`; delete the inline `function ChangeLog(…)` (lines 84–126)
- Remove `FormEdit` type import from `@/lib/forms` (if it was only used by the inline function; `ChangeLog` now owns that type)
- The `<FormReplay>` component already holds `saved` state and renders `SavedBanner` internally (Step 4); no structural change to the page is needed for the banner visibility — the island is self-contained
- Remove all verbose `text-[color:var(--color-*)]` class usages; replace with short-form tokens
- **Acceptance:** detail page renders `GhostBack`, `<FormReplay>` (with `SavedBanner` inside), `<ChangeLog>`; inline `ChangeLog` function removed; TypeScript green; no verbose token classes; e2e smoke passes

---

### Step 7 — Update `actions.ts` comment + import (Phase 3 alignment)

**File:** `apps/web/app/tools/forms/[key]/actions.ts` (MODIFY)

This step is gated on Phase 3 (`@camp404/core` extraction):
- After the catalogue moves to `@camp404/core`, `lib/forms.ts` imports `QUESTIONNAIRE` from `@camp404/core`. The `actions.ts` file does not import the catalogue directly (it receives it via `form.questionnaire`), so **no direct import change** is needed in `actions.ts`.
- **However**: once `hasCampAccess` becomes a thin shim re-exporting from `@camp404/core` (Phase 3, plan 01), the `@/lib/users` import stays valid (the shim is still at that path); no change needed.
- Verify `ID_NUMBER_KEY` import from `@camp404/db/id-documents` still resolves (it does — that module stays in db per plan 03 §Hybrid).
- **Acceptance:** `actions.ts` builds cleanly after Phase 3 extraction; no broken imports; `saveFormReplay` e2e path still green

---

### Step 8 — Update `lib/forms.ts` stale comment

**File:** `apps/web/lib/forms.ts` (MODIFY — minor)

After the `upsertBurnerProfile` COALESCE fix lands in `packages/db` (Phase 2b):
- Update lines 78–80: remove the claim "idempotent on completedAt"; replace with accurate description: "A replay re-saves the form with `markComplete: true`. `upsertBurnerProfile` preserves the original `completedAt` (COALESCE — set only when previously null) while bumping `updatedAt`. This satisfies any re-activated required-action row at the new version."
- **Acceptance:** comment and SQL no longer contradict; no logic change; `pnpm --filter apps/web typecheck` green

---

### Acceptance criteria — cross-cutting

- All gate redirects fire correctly on unauthenticated / uninvited / incomplete / unapproved access (server-side, no client flash)
- List page renders `FormCard` × N or `EmptyState`; tapping a card navigates to `/tools/forms/{key}`
- Detail page: pre-filled wizard advances locally; "Save changes" fires `saveFormReplay`; on success `SavedBanner` appears with `role="status"` and ChangeLog refreshes via `router.refresh()`; on error per-field messages appear in the wizard
- No-op replay (zero-diff): `SavedBanner` still appears; ChangeLog unchanged
- Unknown key: 404 page renders
- `CircleCheckBig` used (not `CheckCircle2`)
- No `text-[color:var(--color-*)]` verbose token form anywhere in the surface files
- `GhostBack` used on both pages (not inline `Link`)
- `EmptyState` used for the list empty state (not inline `<p>`)
- `EmptyState variant="inline"` used for the ChangeLog empty state (not inline `<p>`)
- All renamed imports from `@camp404/ui` resolve; no orphaned `Card`/`CardHeader`/`CardTitle` imports
- `pnpm build` green on `apps/web` after each step

### E2E / test notes

**No dedicated e2e spec for this surface exists today.** The `onboarding-questionnaire.spec.ts` covers the onboarding flow. This surface needs its own spec at `apps/web/tests/e2e/my-forms.spec.ts`. The E2E seam uses `isE2ETestMode()` (in `lib/forms.ts`) routing `recordFormEdit`/`listFormEdits` through `testStore` — the e2e suite can call `POST /api/test/complete-onboarding` (or the equivalent seed endpoint) to put a member into the approved+completed state before navigating to `/tools/forms`.

**Suggested e2e coverage:**
1. Authenticated approved user sees `FormCard` for the burner profile on `/tools/forms`
2. Tapping the card navigates to `/tools/forms/burner_profile`
3. Advancing through the wizard and submitting shows `SavedBanner`
4. Submitting again (same answers) shows `SavedBanner`; ChangeLog shows only one entry (no-op not recorded)
5. Submitting with one changed field shows `SavedBanner` and one ChangeLog entry with the diff
6. Unauthenticated user hitting `/tools/forms` is redirected to sign-in
7. Unknown key (`/tools/forms/nonexistent`) returns 404

---

## Open items

### §1 — `saved` state ownership: island-internal vs prop-to-page

Currently `saved` lives in `form-replay.tsx` (the `"use client"` island) and `SavedBanner` renders inside the island. This means the banner appears within the wizard's wrapper `<div>`, not between the GhostBack and the wizard at the page layout level as drawn on the spec board. Two options:

- **Option A (current approach, keep island-internal):** `SavedBanner` renders inside `<FormReplay>` above `<QuestionnaireWizard>`. The visual position is correct (above the wizard body) because the island wraps both. Small layout divergence from the board: the `GhostBack` is outside the island in the server component, but `SavedBanner` is inside the island. This is acceptable for an RSC architecture.
- **Option B (lift to page via `router.refresh` + URL param):** On `onComplete`, push a `?saved=1` search param; the server component reads it and renders `SavedBanner` server-side; `router.replace` removes the param after render. More complex; no clear benefit for this surface.

**Recommendation:** Option A (island-internal). Flag for design review only if the board position strictly requires the banner between `GhostBack` and `FormReplay` at the server component level. Cross-ref: `open-questions.md` has no item for this; this is a new app-layer decision.

### §2 — `fill:#00dcff26` raw hex in `SavedBanner`

The spec (`12-my-forms.md:62`) prescribes `fill:#00dcff26` for the `SavedBanner` background — an accent-cyan wash. This is a raw hex value. Until a semantic `--accent-subtle` token or `--color-accent-wash` is added to the foundations token set, `SavedBanner` must use `bg-[#00dcff26]`. Track as a foundations follow-up (architecture.md Open decision §8 covers status-token OKLCH values; the accent-wash tint should be added to the same pass). Cross-ref: `open-questions.md` B-theme token reconciliations.

### §3 — `completedAt` overwrite data-integrity (`lib/forms.ts` comment)

Step 8 above (comment update) is gated on the `upsertBurnerProfile` COALESCE fix (service-layer plan 03, Step 3). Until that fix lands, the stale comment at `lib/forms.ts:78-80` remains in place. The visual impact is only on the "Last edited" display when `updatedAt` is null — which cannot happen in the current write path (both `completedAt` and `updatedAt` are always set by `upsertBurnerProfile`). Low-urgency for this surface; high-urgency for the data-integrity concern itself. Cross-ref: `open-questions.md` D16 (elevated to `high`).

### §4 — No e2e spec for this surface

A dedicated `apps/web/tests/e2e/my-forms.spec.ts` does not exist. The build step above calls for one. The test-store seam (`isE2ETestMode()`) in `lib/forms.ts` is already wired; the seed endpoints exist at `/api/test/*`. This is a NEW test file to CREATE, not a modification of an existing one. Cross-ref: `open-questions.md` has no item for this; it is a new gap identified by this plan.

### §5 — `dateFmt` duplication

`dateFmt` (the `en-ZA` medium+short `Intl.DateTimeFormat`) is defined in both `page.tsx` (list) and `[key]/page.tsx` (detail). After the `FormCard` component is extracted it moves into `form-card.tsx`. Consider a shared `apps/web/lib/date-format.ts` singleton (or a small `apps/web/app/tools/forms/_lib/date-format.ts`) to avoid re-declaring across the three files. Low-urgency; no behaviour impact. Not cross-referenced in `open-questions.md`.

### §6 — Multi-select diff display in ChangeLog

Option labels are joined with `", "` and order is sorted before comparison — reordering is invisible in the change log. Confirm with content owners. Cross-ref: `open-questions.md` A13 (`product`, `low`).
