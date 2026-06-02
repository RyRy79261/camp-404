# QueueCard — molecule plan

- **mapsTo:** NEW (app-local) — does not exist anywhere in the codebase today
- **Target file:** `apps/web/app/onboarding/questionnaire/complete/queue-card.tsx`

---

## Current state — does it exist? where? gap vs spec

**Does not exist.**

A grep of all `apps/web` `.tsx`/`.ts` files (excluding `node_modules` and `.next`) finds no `QueueCard`, `queue-card`, or `completion-queue` component anywhere in the codebase. No `app/onboarding/questionnaire/complete/` directory exists. The S27 route itself (`/onboarding/questionnaire/complete`) has not been built.

The board `36-s27-questionnaire-complete-queue.txt` specifies three `<Card>` references — "Row Safety", "Row Dietary", "Row Agreements" — without drilling into card-internal layout. The surface brief `27-questionnaire-complete.md §Components used` explicitly names `QueueCard` as a new component to introduce and flags it as local to this surface or extractable. The `component-library.md ##QueueCard` entry confirms **NEW (app-local)** and lists the anatomy as: title + status (Badge/IconBadge) + contextual affordance.

**Gap:** the entire component, its parent route, and its data-loading server component are absent. No prior implementation exists to build on.

---

## API — props, variants, sizes, states

### Prop interface sketch

```tsx
import type { RequiredActionStatus } from "@camp404/types";

// Surface-local status union (maps from requiredActionStatusEnum)
type QueueCardStatus = "complete" | "next-up" | "locked" | "expired";

interface QueueCardProps {
  /** Display name pulled from required_actions.title (e.g. "Safety & logistics") */
  title: string;

  /** Derived status; drives all visual + interactive treatment */
  status: QueueCardStatus;

  /** ISO timestamp — shown on complete cards as "Done D MMM" (required_actions.completed_at) */
  completedAt?: string | null;

  /** ISO timestamp — shown on next-up/pending cards as "Due D MMM" (required_actions.due_at) */
  dueAt?: string | null;

  /**
   * Navigation target for the next-up state.
   * Points to the S25 questionnaire gate route for the pending questionnaire key.
   * When present and status === "next-up" the whole card is a Next.js <Link>.
   * Absent for complete/locked/expired rows — those are inert.
   */
  href?: string;

  /** Optional: overrides the default affordance label on next-up cards ("Start" / "Continue") */
  ctaLabel?: string;
}
```

### Variants (by status)

| Status | Visual treatment | Interactive | Board evidence |
|---|---|---|---|
| `complete` | Full opacity; `check` icon in `$accent` (`IconBadge tone="info"`); meta line "Done D MMM" if `completedAt` present; "Done" if absent | No — card is inert; no pointer events | Board "Row Safety" and "Row Dietary" at full opacity |
| `next-up` | Full opacity; `arrow-right` or `play` icon in `$primary` (`IconBadge tone="primary"`); "Due D MMM" if `dueAt` present; whole card is a `<Link href={href}>` with `interactive` hover; `Button-Primary` or inline CTA affordance | Yes — `<Link>` wraps entire card (or trailing Button) | Board "More Required" variant: "Start next questionnaire" CTA targets the next pending row |
| `locked` | `opacity-55 pointer-events-none`; `lock` icon in `$muted-foreground` (no tone); no affordance rendered | No | Board "Row Agreements" at `op: 0.55` |
| `expired` | Full opacity; `clock` icon in `$warning` (`IconBadge tone="warning"`); label "Expired — contact a captain"; no affordance | No | Not on board; added defensively per `27-questionnaire-complete.md §Validation & edge cases` |

### Sizes

Single size only — `w-full` (always fills the `Required Queue List` container). Internal padding inherits from `Card` (`p-6` → overridden to `p-4` for compact row density; see Composition below).

### States

| State | Trigger | Visual delta |
|---|---|---|
| `complete` | `status === "complete"` | Full opacity; accent check icon; "Done" meta |
| `next-up` | `status === "next-up"` | Full opacity; primary arrow icon; Link hover (`bg-accent/25`); CTA affordance |
| `locked` | `status === "locked"` | `opacity-55 pointer-events-none` wrapper; muted lock icon; no affordance |
| `expired` | `status === "expired"` | Full opacity; warning clock icon; "Expired — contact a captain" label; no affordance |

---

## Tokens & type — exact design tokens + type-scale roles

### Colour tokens (all semantic; no raw hex)

| Usage | Token | Notes |
|---|---|---|
| Card surface | `bg-card` → `--color-card` | Inherited from Card |
| Card border | `border-border` → `--color-border` | Inherited from Card |
| Complete status icon | `text-accent` → `--color-accent` | `info` = `accent` (design-tokens §2.2); check badge stays on accent per the affirmative end-state rule |
| Complete icon badge fill | `bg-accent/15` → `--color-accent` at 15% | Matches `$accent/15%` canonical step (design-tokens §2.3) |
| Next-up status icon | `text-primary` → `--color-primary` | Active actionable row uses brand primary |
| Next-up icon badge fill | `bg-primary/15` → `--color-primary` at 15% | Canonical 15% step |
| Next-up card hover | `hover:bg-accent/25` → `--color-accent` at 25% | "strong" step per design-tokens §2.3 |
| Locked icon | `text-muted-foreground` → `--color-muted-foreground` | No tone fill; greyed treatment |
| Expired icon | `text-warning` → `--color-warning` (NEW token) | Requires status token foundations to ship first |
| Expired icon badge fill | `bg-warning/15` → `--color-warning` at 15% | |
| Meta / caption text | `text-muted-foreground` → `--color-muted-foreground` | "Done D MMM", "Due D MMM", "Expired — contact a captain" |
| Title text | `text-card-foreground` → `--color-card-foreground` | Standard card text |
| Locked opacity wrapper | `opacity-55 pointer-events-none` | CSS property; no colour token |

### Typography roles

| Element | Token | Face | Size | Weight | Notes |
|---|---|---|---|---|---|
| Questionnaire title | `--text-subtitle` (default) | Inter | 16px | 700 | `CardTitle` at 16px/700 per design-tokens §1.2 |
| Meta line ("Done D MMM" / "Due D MMM") | `--text-caption` | Inter | 12px | 400–500 | `$muted-foreground` |
| Expired label | `--text-caption` | Inter | 12px | 400 | `$muted-foreground`; no JetBrains Mono |
| CTA label on next-up ("Start" / "Continue") | `--text-body-strong` | Inter | 14px | 500–600 | If rendered as a trailing text link rather than Button |

No JetBrains Mono usage inside QueueCard. The questionnaire name is a human-readable title (prose), not a slug or data-console string. Due/completed dates are formatted human strings.

### Radius

Card container inherits `--radius` (10px / `0.625rem`) from the base `Card` primitive per design-tokens §3. No additional radius overrides needed.

---

## Composition & deps — atoms/primitives + @camp404/core helpers

```
QueueCard
  ├─ Card (packages/ui/src/components/card.tsx)
  │   └─ CardContent (p-4 override for compact row density)
  ├─ IconBadge (packages/ui/src/components/icon-badge.tsx — PROMOTE target)
  │   ├─ complete:  icon=Check    tone="info"     size="sm"
  │   ├─ next-up:   icon=Play     tone="primary"  size="sm"
  │   ├─ locked:    icon=Lock     tone="muted"    size="sm"
  │   └─ expired:   icon=Clock    tone="warning"  size="sm"
  ├─ Next.js <Link> (next/link) — wraps entire card when status === "next-up" && href
  └─ cn()  ← @camp404/ui/lib/utils
```

**@camp404/core helpers used:**

- **`formatShortDate(isoString: string): string`** — a pure helper that formats an ISO timestamp to "D MMM" (e.g. "3 May"). If this helper does not yet exist in `@camp404/core`, it can be a local one-liner in the route module until core extraction happens; declare the dependency here so it is not duplicated across surfaces. No date library required — `Intl.DateTimeFormat` is sufficient.
- No `rankLevel` or `initialsFrom` needed — QueueCard has no rank gate and no avatar.

**Dependencies that must ship before QueueCard:**

1. `IconBadge` — PROMOTE target; `tone="warning"` specifically requires the NEW status tokens (`--color-warning`) to resolve. Foundations-tokens must land first.
2. `--color-warning` NEW status token in `globals.css` — required for the `expired` state.
3. `Card` variant normalisation (molecule-card.md step 2) — QueueCard inherits the corrected `--radius` and stripped `shadow-sm`.

---

## Absorbs — merge-map candidates replaced

QueueCard does **not** appear in the component-library merge map as an absorbing canonical. It is a purpose-built specialisation with no inventory duplicates to collapse.

The board shows three `<Card>` references ("Row Safety", "Row Dietary", "Row Agreements") that are underspecified stubs. QueueCard replaces those stubs in the built surface — no other existing component is deleted or merged.

No candidates from the 57-item inventory fold into QueueCard.

---

## Stories & tests

### Storybook stories

```
QueueCard.stories.tsx
  (app-local storybook if configured; else document-only until promoted)

  Complete           — status="complete" completedAt="2025-05-03T00:00:00Z"
                       title="Safety & logistics"
  CompleteNoDate     — status="complete" completedAt={null}; shows "Done" fallback
  NextUp             — status="next-up" href="/onboarding/questionnaire/safety"
                       dueAt="2025-06-15T00:00:00Z" title="Dietary requirements"
  NextUpNoDue        — status="next-up" href="..." dueAt={null}; no meta line
  Locked             — status="locked" title="Agreements"; opacity-55 visible
  Expired            — status="expired" title="Safety & logistics"
  QueueStack         — three cards in the canonical Safety/Dietary/Agreements order:
                       complete + next-up + locked (the representative S27 scenario)
  AllComplete        — three complete cards (all-done variant scenario)
```

### Vitest / RTL test cases

```
queue-card.test.tsx

Rendering
  renders the questionnaire title in all status variants
  complete: renders a check icon badge (aria-label or role implies status)
  next-up:  renders a play/arrow icon badge
  locked:   renders a lock icon badge
  expired:  renders a clock icon badge

Status — complete
  applies full opacity (no opacity class on wrapper)
  card is not wrapped in a Link (non-interactive)
  shows "Done D MMM" when completedAt is provided
  shows "Done" (fallback) when completedAt is null

Status — next-up
  wraps the card in a <Link> with the provided href
  shows "Due D MMM" when dueAt is provided
  omits meta line when dueAt is null
  applying hover class (bg-accent/25 present via Card variant)
  renders CTA affordance (default label "Start"; custom ctaLabel override)

Status — locked
  applies opacity-55 and pointer-events-none classes to the wrapper
  does NOT render a <Link>
  does NOT render a CTA affordance

Status — expired
  applies full opacity (no opacity override)
  renders "Expired — contact a captain" meta text
  does NOT render a <Link>

A11y
  next-up card: <Link> has accessible text from title + ctaLabel (not icon-only)
  locked card: inert; no focusable children reachable via Tab
  expired card: icon badge has aria-label describing status
  complete card: icon badge has aria-label "Complete"

Snapshot
  complete card snapshot
  next-up card snapshot
  locked card snapshot
```

### Accessibility notes

- The `next-up` card wraps the entire card in a `<Link>`. The accessible name must be formed from the visible title text; confirm the link's accessible name is not empty. The trailing CTA label ("Start" / "Continue") should be visually present, not icon-only, to avoid link-without-text violations.
- The `locked` card must be fully inert: `pointer-events-none` alone removes mouse interaction but keyboard users can still Tab to children. Apply `tabIndex={-1}` to any focusable descendants (or use `inert` HTML attribute when browser support permits) or simply render no interactive children in the locked state.
- Icon badges in all states must carry an `aria-label` describing the status ("Complete", "Next up", "Locked", "Expired") since the icon alone does not convey state to screen-reader users.
- No `role="list"` / `role="listitem"` needed on QueueCard itself — the parent `Required Queue List` `<ul>` + `<li>` wrappers provide list semantics; QueueCard renders inside an `<li>`.

---

## Build steps

### Step 0 — Pre-requisite gate (blocking)
- `--color-warning` and `--color-warning-foreground` NEW status tokens must be present in `packages/ui/src/styles/globals.css` (foundations-tokens plan). `IconBadge tone="warning"` resolves through this token.
- `IconBadge` PROMOTE must be complete with `tone` prop (`info` / `primary` / `muted` / `warning`) and `size="sm"` implemented.
- `Card` normalisation (molecule-card.md) must be complete: `--radius` radius, no `shadow-sm`, correct `CardTitle` 16px/700.
- **Acceptance:** `pnpm build` in `packages/ui` passes; `--color-warning` resolves in Storybook; `IconBadge tone="warning"` renders amber icon badge.

### Step 1 — Create route and server component shell
- Create directory `apps/web/app/onboarding/questionnaire/complete/`.
- Add `page.tsx` as a Next.js Server Component. Auth-gate: redirect to `/auth/sign-in` if no session (same pattern as `app/onboarding/questionnaire/page.tsx`).
- Stub data loading: read `required_actions` for `userId` where `type = 'questionnaire'` and `actionKey != 'burner_profile'`; order by `createdAt ASC`.
- Derive `allDone` (all rows `completed | waived`), `pendingCount` (blocking rows with `status = pending`), and per-row `QueueCardStatus` (first pending = `next-up`; subsequent pending = `locked`; `completed | waived` = `complete`; `expired` = `expired`).
- **Acceptance:** route renders without crash; auth redirect works; TypeScript clean.

### Step 2 — Build QueueCard component
- Create `apps/web/app/onboarding/questionnaire/complete/queue-card.tsx`.
- Implement the four status variants using `Card` + `CardContent` + `IconBadge` + `cn()`.
- Locked wrapper: apply `opacity-55 pointer-events-none` to a `<div>` containing the Card; do not pass opacity to Card itself (Card's `variant` prop has no opacity state).
- Next-up wrapper: `<Link href={href}>` wraps the card; card gets `Card variant="interactive"` for hover treatment.
- Meta lines: use a local `formatShortDate` utility (ISO → "D MMM") or import from `@camp404/core` if available by build time.
- **Acceptance:** all four status variants render correctly in isolation; Storybook stories pass; TypeScript clean; no raw hex colours.

### Step 3 — Wire QueueCard into the page
- Replace the stub `<Card>` references in `page.tsx` with `<QueueCard>` mapped from derived `required_actions` data.
- Wire `CompletionHero` (separate molecule plan) alongside the queue list.
- Render queue rows inside a `<ul>` with each `QueueCard` inside an `<li>`.
- **Acceptance:** page renders with live data; `next-up` card navigates to the correct questionnaire gate; locked cards are non-interactive; complete cards show formatted date.

### Step 4 — Stories + tests
- Write `queue-card.test.tsx` (RTL + vitest) covering all cases listed above.
- Write `QueueCard.stories.tsx` (or add to an app-local Storybook if configured) covering the eight story cases.
- Run a11y checks: locked card is not Tab-reachable; next-up link has accessible text; icon badges have `aria-label`.
- **Acceptance:** `pnpm test` green in `apps/web`; no a11y violations in the Storybook a11y panel for any story.

### Step 5 — Expired-state confirmation
- Confirm with product/captain team whether `expired` rows should appear in the queue list or be suppressed (per `27-questionnaire-complete.md` open question 5). If suppressed: filter them out at the data layer before deriving status; keep the `expired` prop variant in the component for defensive rendering of unexpected data.
- **Acceptance:** product decision documented in a code comment on the `page.tsx` data derivation; behaviour is consistent with the decision.

---

## Consumers

| Consumer | Role | Notes |
|---|---|---|
| `apps/web/app/onboarding/questionnaire/complete/page.tsx` | S27 surface (sole consumer) | Server component; renders one QueueCard per `required_actions` row; list ordered by `createdAt ASC` |

QueueCard is app-local to the S27 route. It has exactly one consumer today. The component-library entry notes it as extractable if a second consumer emerges, but no second consumer is specified in any surface brief or the merge map. Do not promote to `@camp404/ui` prematurely.

If the gating spine is later extended to show a queue summary elsewhere (e.g. a blocking questionnaire overlay on the home screen), revisit extraction at that point.
