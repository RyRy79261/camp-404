# CompletionHero — molecule plan

- **mapsTo:** NEW (app-local) · no existing source in `packages/ui/src/components/` or `apps/web`
- **Target file:** `apps/web/app/onboarding/questionnaire/complete/completion-hero.tsx`

---

## Current state — does it exist? where? gap vs spec

**Does not exist anywhere.** Verified by:

- `packages/ui/src/components/` lists 25 files (confirmed); no `completion-hero.tsx`.
- `grep -r "CompletionHero|completion-hero" apps/web` returns zero results.
- The only S27-related route today is the burner-profile questionnaire at
  `apps/web/app/onboarding/questionnaire/page.tsx`, which redirects to `/` on
  success (`redirect("/")`) — it has no success/completion hero or queue screen.
  S27 (`/onboarding/questionnaire/complete`) does not yet exist as a route.

The component is therefore **entirely new** — it cannot be REUSE or PROMOTE.

**Gaps vs spec** (board `36-s27-questionnaire-complete-queue.txt` + surface brief
`design/spec/surfaces/27-questionnaire-complete.md`):

| Spec element | Live state | Gap |
|---|---|---|
| Check icon badge 88×88 `r:999` `#00dcff24` | Absent | Build with `IconBadge size="lg" tone="accent" shape="circle"` |
| Heading "Questionnaire complete" 22px/700 | Absent | Build |
| Sub-heading 14px/normal `$muted-foreground` | Absent | Build |
| `all-done` slot: Button "Back to camp" + caption | Absent | Build |
| `more-required` slot: count line + Button "Start next questionnaire" | Absent | Build |
| Token normalisation: `#00dcff24` → `accent/15%` | — | Per design-tokens.md §4 reconciliation #11 |

**Classification: NEW** (app-local; component-library.md §CompletionHero: "mapsTo: NEW
(app-local)"). Not promoted to `@camp404/ui` — sole consumer is the S27 route and the
component-library.md explicitly scopes it there.

---

## API — props, variants, sizes, states

### TypeScript prop interface

```ts
// apps/web/app/onboarding/questionnaire/complete/completion-hero.tsx

import type { ReactNode } from "react";

export type CompletionHeroVariant = "all-done" | "more-required";

export interface CompletionHeroProps {
  /**
   * Controls which CTA slot is rendered.
   *   "all-done"       — "Back to camp" button + "You're all caught up." caption.
   *   "more-required"  — count line + "Start next questionnaire" button.
   */
  variant: CompletionHeroVariant;

  /**
   * Required when variant="more-required".
   * Count of blocking required_actions rows where status = 'pending'.
   * Drives the copy "N more required before you're unlocked".
   */
  pendingCount?: number;

  /**
   * Override heading. Defaults to "Questionnaire complete".
   * Provided for future re-use with different questionnaire titles if needed,
   * but kept optional — the board prescribes a single heading string.
   */
  heading?: string;

  /**
   * Override sub-heading. Defaults to "Thanks — that's logged with the captains."
   */
  subheading?: string;

  /**
   * href for the primary CTA.
   *   "all-done"      — defaults to "/" (home).
   *   "more-required" — href to the next pending questionnaire gate (S25).
   *                     Caller must supply; no default for the more-required case.
   */
  ctaHref: string;
}
```

### Variants

| Variant | Rendered slot | Board evidence |
|---|---|---|
| `all-done` | `Button-Primary` "Back to camp" (`w-full`) + caption "You're all caught up." (12px/normal `$muted-foreground`) | Board "Variant All Done" block, `36-s27-questionnaire-complete-queue.txt` L12–15 |
| `more-required` | Count line "N more required before you're unlocked" (13px/600 `$foreground`) + `Button-Primary` "Start next questionnaire" (`w-full`) | Board "Variant More Required" block, L16–19 |

### States

| State | Description |
|---|---|
| `all-done` | `pendingCount` is 0 or undefined; CTA navigates to `/` |
| `more-required` | `pendingCount >= 1`; count line is grammatically singular ("1 more…") or plural ("N more…") |
| static | No loading or interactive state within this component; server-rendered, data resolved before paint (S27 surface brief §States — Loading row) |

**Size:** no size prop — the hero is a fixed-geometry, full-width column per the board. Internal
`IconBadge` is always `size="lg"` (88px, normalised; `atom-iconbadge.md` §Size normalisation
documents 88px → `lg`).

---

## Tokens & type — exact design tokens + type-scale roles used

All tokens are from `design/spec/design-tokens.md` and `design/spec/component-library.md`.
No raw hex. No `emerald/amber/sky/rose` utilities.

### Layout tokens

| Element | Token | Value source |
|---|---|---|
| Section container | `gap: 14px`, `padding: [8,0]`, `align-items: center` | Board "Completion Success" frame, L6 |
| Variant slot | `gap: 8px`, `padding: [16,0,0,0]` | Board "Variant All Done" / "Variant More Required" frames, L12/16 |

### Colour tokens

| Element | Token | Reconciliation note |
|---|---|---|
| Icon badge fill | `bg-accent/15` | Board `#00dcff24` (alpha `24` = 14% → snap to 15%); design-tokens.md §4 reconciliation #11: questionnaire-complete check badge stays `accent/15%` (info), deliberately NOT `success` |
| Icon badge icon | `text-accent` | Board `check ($accent)` |
| Heading | `text-foreground` | Board `$foreground` |
| Sub-heading | `text-muted-foreground` | Board `$muted-foreground` |
| Count line (more-required) | `text-foreground` | Board `$foreground` |
| Caption (all-done) | `text-muted-foreground` | Board `$muted-foreground` |
| Divider (host, not in hero) | `bg-border` | Board "Divider" element; rendered by host page, not CompletionHero |

### Type-scale roles

| Element | Role token | Face | Size | Weight | Source |
|---|---|---|---|---|---|
| Heading | `--text-title` (22px compact variant) | Inter | 22px/700 | lh 1.2 | design-tokens.md §1.1: "22px = compact title (Notifications, questionnaire-gate overlay, complete screen)"; board `Inter/22px/700/$foreground` |
| Sub-heading | `--text-body` | Inter | 14px/normal | lh 1.45 | design-tokens.md §1.1 Body row; board `Inter/14px/normal/$muted-foreground` |
| Count line | `--text-body-strong` | Inter | 13px/600 | lh 1.45 | design-tokens.md §1.1: "13px/600" maps to body-emphasis / label band; board `Inter/13px/600/$foreground` |
| Caption (all-done) | `--text-caption` | Inter | 12px/normal | lh 1.4 | design-tokens.md §1.1 Caption row; board `Inter/12px/normal/$muted-foreground` |
| Button label | handled by `Button` atom | Inter | see `atom-button.md` | — | `@camp404/ui/button.tsx` reuse |

No JetBrains Mono in this component — all text is Inter prose/UI copy, never data-console.

---

## Composition & deps — atoms, primitives, helpers

| Dep | Source | Role | Classification |
|---|---|---|---|
| `IconBadge` | `packages/ui/src/components/icon-badge.tsx` (PROMOTE, per `atom-iconbadge.md`) | 88px circle `check` icon; `size="lg"` `tone="accent"` `shape="circle"` | Atom dep; must be built first |
| `Button` | `packages/ui/src/components/button.tsx` (REUSE) | Primary CTA in both variants | Atom dep; already exists |
| `cn` | `packages/ui/src/lib/utils.ts` (REUSE; standard shadcn util) | Class merging | Utility |
| `Link` (Next.js) | `next/link` | CTA navigation; app-local import is permitted in app-local components | Framework |

No `@camp404/core` helpers are needed directly in this component — `CompletionHero` is
purely presentational and receives pre-computed `variant` and `pendingCount` from the
server component parent (the S27 page). The parent uses `@camp404/core` clearance/queue
helpers; this component is the view layer only.

No `rankLevel` or data-domain logic — CompletionHero is a static presenter with no app-domain
knowledge (variant + count arrive as props).

---

## Absorbs — candidates replaced by this component

Per the component-library.md merge map, `CompletionHero` absorbs the following inventory
candidate that would otherwise be built as a separate component:

| Absorbed candidate | Original pattern | Why merged |
|---|---|---|
| `completion-hero circle` (IconBadge merge map row) | The board's 88×88 `#00dcff24` check circle drawn inline in S27 | This icon-circle is just `IconBadge size="lg" tone="accent" shape="circle" icon={Check}` — the generic `IconBadge` atom absorbs it; `CompletionHero` composes `IconBadge` rather than re-implementing the circle. No separate "check-circle" component ships. |

The `IconBadge` atom itself absorbs the "completion-hero circle" listed in the merge map
(component-library.md §Merge map, IconBadge row: "EmptyState circle, completion-hero circle").
`CompletionHero` is therefore the sole downstream consumer of that absorbed pattern — zero
redundancy.

No other merge-map candidates are absorbed directly by `CompletionHero` itself.

---

## Stories & tests

### Storybook stories

File: `apps/web/app/onboarding/questionnaire/complete/completion-hero.stories.tsx`
(co-located with the component; app-local, not in `packages/ui/src/components/`).

| Story name | Props | Purpose |
|---|---|---|
| `AllDone` | `variant="all-done"` `ctaHref="/"` | Default/happy path; every blocking questionnaire complete |
| `MoreRequiredSingular` | `variant="more-required"` `pendingCount={1}` `ctaHref="/onboarding/questionnaire/dietary"` | Singular count copy — "1 more required before you're unlocked" |
| `MoreRequiredPlural` | `variant="more-required"` `pendingCount={2}` `ctaHref="/onboarding/questionnaire/dietary"` | Plural count copy — "2 more required before you're unlocked" |
| `CustomCopy` | `variant="all-done"` `heading="Safety complete"` `subheading="Logged — thanks."` `ctaHref="/"` | Override heading/subheading props; confirms custom copy renders |

### Vitest / RTL test cases

File: `apps/web/app/onboarding/questionnaire/complete/__tests__/completion-hero.test.tsx`

| Test | Assertion |
|---|---|
| renders check icon badge | `screen.getByRole("img", { hidden: true })` finds the `Check` icon (or confirm `aria-hidden` is set on the decorative icon circle) |
| renders heading | `screen.getByRole("heading", { name: /questionnaire complete/i })` |
| renders sub-heading | `screen.getByText(/that's logged with the captains/i)` |
| all-done: renders "Back to camp" button | `screen.getByRole("link", { name: /back to camp/i })` has `href="/"` |
| all-done: renders caption | `screen.getByText(/you're all caught up/i)` |
| all-done: does NOT render count line | `expect(screen.queryByText(/more required/i)).toBeNull()` |
| more-required: renders count line singular | `pendingCount={1}` → `screen.getByText(/1 more required before you're unlocked/i)` |
| more-required: renders count line plural | `pendingCount={2}` → `screen.getByText(/2 more required before you're unlocked/i)` |
| more-required: renders "Start next questionnaire" | `screen.getByRole("link", { name: /start next questionnaire/i })` has `href` matching `ctaHref` |
| more-required: does NOT render caption | `expect(screen.queryByText(/you're all caught up/i)).toBeNull()` |
| more-required: missing pendingCount → count line absent | `pendingCount={undefined}` with `variant="more-required"` → count line renders nothing (defensive guard) |

### Accessibility notes

- The heading must be an `<h2>` (or `<h1>` depending on page heading hierarchy of the
  S27 route — the surface brief implies Section A is a primary section; confirm with the
  S27 page structure. If the route has no other `<h1>`, use `<h1>`; otherwise `<h2>`).
- The icon badge is **decorative** — the `Check` lucide icon inside `IconBadge` must carry
  `aria-hidden="true"`. The heading communicates success; no additional `role="status"` or
  `role="alert"` is needed (the surface is a navigation destination, not a toast/live region).
- The CTA `Button` wraps a `Link` (`asChild`); it must have a meaningful accessible name
  from its label text ("Back to camp" / "Start next questionnaire") — no `aria-label` override
  needed.
- The count line ("N more required before you're unlocked") is static copy in a `<p>` — no
  live-region role needed (it is server-rendered with its final value, not updated client-side).
- Ensure `text-muted-foreground` copy (sub-heading, caption, count footer on surface) passes
  4.5:1 contrast against `$card` or `$background`. The OKLCH `0.7 0.05 325` foreground on
  `0.15 0.05 295` background is a known design-tokens.md carry — confirm contrast in visual QA.

---

## Build steps — ordered + acceptance criteria

Dependencies in `[]` denote which plan must be done first.

**Step 0 — Prerequisites (not this plan's work, but must land first)**

- [ ] `foundations-tokens.md`: `--color-success`, `--color-warning`, `--color-info` added to
  `packages/ui/src/styles/globals.css` (needed by the broader system; CompletionHero itself
  only uses `accent`, but the token file must be consistent before any status-tinted components ship).
- [ ] `atom-iconbadge.md`: `packages/ui/src/components/icon-badge.tsx` exists and accepts
  `size="lg" tone="accent" shape="circle"`.

**Step 1 — Create the S27 route file**

Create `apps/web/app/onboarding/questionnaire/complete/page.tsx` as a Next.js server
component. This step does not build `CompletionHero` yet — it confirms the route compiles
and auth-guards correctly.

Acceptance: `GET /onboarding/questionnaire/complete` (authed) returns 200; unauthed
redirects to `/auth/sign-in`.

**Step 2 — Build `CompletionHero`**

Create `apps/web/app/onboarding/questionnaire/complete/completion-hero.tsx`.

Acceptance criteria:
- Props match the `CompletionHeroProps` interface exactly.
- `variant="all-done"` renders heading + sub-heading + `IconBadge` + "Back to camp" link
  + "You're all caught up." caption. No count line present.
- `variant="more-required"` with `pendingCount={1}` renders "1 more required before you're
  unlocked" and "Start next questionnaire" link. No "You're all caught up." present.
- `variant="more-required"` with `pendingCount={2}` renders "2 more required before you're
  unlocked" (plural grammar matches board copy pattern).
- All colours are token-only: `bg-accent/15`, `text-accent`, `text-foreground`,
  `text-muted-foreground`. Zero raw hex, zero `emerald/amber/sky/rose` utilities.
- All type sizes use Tailwind utilities that resolve to the token scale (`text-[22px]` or
  a mapped token class, not inline arbitrary sizes outside the scale).
- Icon `Check` from `lucide-react` inside `IconBadge` carries `aria-hidden="true"`.
- The heading element is `<h1>` (confirm with page structure; see a11y notes above).

**Step 3 — Wire `CompletionHero` into the S27 page**

Update `apps/web/app/onboarding/questionnaire/complete/page.tsx` to:
- Fetch `required_actions` for the signed-in user (`type = 'questionnaire'`, `blocking = true`,
  `action_key != 'burner_profile'`).
- Compute `allDone` and `pendingCount`.
- Pass `variant`, `pendingCount`, and `ctaHref` to `<CompletionHero>`.

Acceptance: server renders the correct variant based on live `required_actions` data. The
`Divider` and Section B queue list (`QueueCard` rows) are siblings in the page but are NOT
part of `CompletionHero` — they are separate elements in the page's vertical stack.

**Step 4 — Vitest / RTL tests**

Write tests per the test case table above.

Acceptance: all tests pass (`vitest run`); no snapshot tests.

**Step 5 — Storybook stories**

Write all four stories per the stories table above.

Acceptance: stories render in isolation without a Next.js router mock error; all variants
visually match the board at 430px viewport width.

**Step 6 — Visual QA against board**

Compare rendered output to `36-s27-questionnaire-complete-queue.txt` Section A at 430px.

Acceptance:
- `IconBadge` circle is visually ~88px, `accent/15` fill, `check` icon in `accent`.
- Heading 22px bold, centred, `foreground`.
- Sub-heading 14px normal, centred, `muted-foreground`.
- "All done" variant: full-width button + caption below it.
- "More required" variant: count line (13px/600) above button; button full-width.
- No raw-hex class names visible in DevTools.
- Heading contrast >= 4.5:1 against page background.

---

## Consumers — which molecules/organisms/surfaces use CompletionHero

| Consumer | File (planned) | How it uses CompletionHero |
|---|---|---|
| S27 questionnaire complete page | `apps/web/app/onboarding/questionnaire/complete/page.tsx` | Direct parent; passes `variant`, `pendingCount`, `ctaHref` from server-fetched `required_actions` data |

**CompletionHero has exactly one consumer.** The component-library.md entry confirms: "Used
by: completion-queue (S27). (Invite-tool / my-forms success states reuse IconBadge + Alert
instead.)" — those other success screens do NOT use CompletionHero; they compose their own
`IconBadge` + `Alert` instances. This is intentional: `CompletionHero` is app-local, not
promoted to `@camp404/ui`, precisely because it has a single consumer and domain-specific copy.

The `QueueCard` molecule (also NEW, app-local, S27 sibling) is rendered by the same page
but is a **sibling** in the vertical stack, not a consumer of `CompletionHero`.
