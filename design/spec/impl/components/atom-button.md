# Button — atom plan

- **mapsTo:** REUSE `packages/ui/src/components/button.tsx`
- **Target file:** `packages/ui/src/components/button.tsx`

---

## Current state — does it exist? where? gap vs spec

The component **exists and is already the canonical primitive.** Every consumer
in `apps/web` imports from `@camp404/ui/components/button` — there are zero
hand-rolled `<button>` duplicates, and the dead `DictateButton` wrapper
(`apps/web/components/voice/dictate-button.tsx`) is a DROPPED orphan per the
component-library notes; it composes `Button`, it does not replace it.

**Source:** `packages/ui/src/components/button.tsx`  
Radix `Slot` + CVA, `ButtonProps` extending
`React.ButtonHTMLAttributes<HTMLButtonElement>`.  

**Existing variants:** `default · destructive · outline · secondary · ghost · link`  
**Existing sizes:** `default (h-10) · sm (h-9) · lg (h-11) · icon (h-10 w-10) · icon-lg (h-14 w-14)`

**Gaps vs spec (design/spec/component-library.md + design/spec/design-tokens.md):**

1. **Hardcoded `rounded-md`** in the base class and in `sm`/`lg` sizes. Spec
   (design-tokens.md §3) requires `rounded-[var(--radius)]` for every
   card/input/button. The `--radius` token exists in `globals.css` (0.625rem /
   10px) but the button does not reference it — `rounded-md` is Tailwind's
   built-in 0.375rem (6px). This means every rendered Button is visibly too
   sharp relative to the design boards which draw `r:$radius` (10px). Confirmed
   in boards 04-button-primary.txt and 05-button-outline.txt:
   `pad:[13,22] r:$radius`.

2. **`text-sm` / `font-medium`** in the base class. The boards draw Button
   label text at `Inter/15px/600` (boards 04, 05); `text-sm` is Tailwind's
   14px/400 and `font-medium` is weight 500. Must align to the `--text-body-strong`
   role (14px/500–600) or the board's 15px/600 step. Given design-tokens.md §1.1
   defines `--text-body-strong` as 14px/500–600 and the button boards draw
   15px/600, the correct normalisation is Inter 14px/600 (`text-sm font-semibold`)
   — 15px is not a canonical scale step, 14px is the nearest defined step.

3. **Outline variant hover** is `hover:bg-accent hover:text-accent-foreground`.
   This matches the board (accent tint on hover is correct), but the base fill
   uses `bg-background` rather than `bg-transparent`. The board (05-button-outline.txt)
   draws `fill:#00000000` (transparent). On the muted/card surface a
   `bg-background` base bleeds midnight-violet through the border — this is a
   minor visual artefact, not a blocking functional gap. Fix is `bg-transparent`.

4. **`ring-offset-background` focus-visible** — uses the verbose
   `[color:var(...)]` pattern; spec (design-tokens.md §4 reconciliation #22)
   wants short-form `bg-background`. Cosmetic codebase cleanup.

5. **`icon-lg` size** (h-14 w-14) is present in the source but missing from the
   Storybook stories (`button.stories.tsx`). Not a runtime gap but a test/doc gap.

6. **No `loading` prop.** The spec notes "loading (consumer swaps label +
   spinner)". This is intentional — the component does NOT own a `loading` prop;
   consumers manage it (e.g. `invite-form.tsx` renders `<Loader2 /> Creating…`
   inside the children). This is **not a gap**; it is spec-correct. Confirmed:
   `disabled` + external Spinner is the contract.

---

## API — props, variants, sizes, states

```ts
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (Radix Slot — e.g. <Button asChild><Link /></Button>). */
  asChild?: boolean;
}
```

### Variant prop

| Value | Intent | Board source |
|---|---|---|
| `default` | Primary brand action — hot-magenta fill | `Button-Primary` (board 04) |
| `outline` | Secondary action — transparent + `$border` stroke | `Button-Outline` (board 05) |
| `ghost` | Tertiary/back nav — no bg, no border | S24 primitive-kit ghost row |
| `destructive` | Destructive action (Delete account, Stop recording) | S24 primitive-kit destructive row |
| `secondary` | Quieter interactive — muted magenta-violet fill | EnablePush (`variant="secondary"`) |
| `link` | Inline link affordance — underline on hover | Auth "Forgot password" etc. |

### Size prop

| Value | Height | Padding | Use case |
|---|---|---|---|
| `default` | h-10 (40px) | px-4 py-2 | Standard CTA, form submit, dialog action |
| `sm` | h-9 (36px) | px-3 | Ghost back-nav rows, compact toolbar actions |
| `lg` | h-11 (44px) | px-8 | Landing CTA (`landing-hero.tsx`) |
| `icon` | h-10 w-10 | — | Square icon button (invite shuffle trigger) |
| `icon-lg` | h-14 w-14 | — | Large icon button (available for future use) |

### States

| State | Realisation |
|---|---|
| default | CVA base class |
| hover | `hover:bg-{variant}/90` or `hover:bg-accent` (outline/ghost) |
| focus-visible | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| disabled | `disabled:pointer-events-none disabled:opacity-50` (applies to both `disabled` attr and `aria-disabled` via pointer-events) |
| loading | **Consumer-owned:** `disabled={isPending}` + children swap to `<Spinner size="sm" /> Label…`; Button renders the children as given — no internal loading prop. |

---

## Tokens & type — exact design tokens + type-scale roles

All resolved through `globals.css` `@theme` or Tailwind semantic utilities.
No raw hex, no `dark:` variants (dark-only app).

### Colour tokens used

| Variant | Background | Text | Hover bg | Border |
|---|---|---|---|---|
| `default` | `bg-primary` | `text-primary-foreground` | `hover:bg-primary/90` | — |
| `destructive` | `bg-destructive` | `text-destructive-foreground` | `hover:bg-destructive/90` | — |
| `outline` | `bg-transparent` | `text-foreground` | `hover:bg-accent/15` `hover:text-accent-foreground` | `border-input` |
| `secondary` | `bg-secondary` | `text-secondary-foreground` | `hover:bg-secondary/80` | — |
| `ghost` | — | `text-foreground` | `hover:bg-accent/15` `hover:text-accent-foreground` | — |
| `link` | — | `text-primary` | — | — |
| focus ring (all) | — | — | — | `ring-ring` (`= $primary`) |

Notes:
- Outline hover was `hover:bg-accent hover:text-accent-foreground`; spec wants
  the board-correct tint (`accent/15%` per design-tokens.md §2.3 canonical alpha
  steps), i.e. `hover:bg-accent/15`. This resolves the gap between the board
  drawing transparent hover and the current full-opacity accent hover.
- Ghost hover: same treatment — `hover:bg-accent/15`.

### Type-scale role

- **Label text:** `--text-body-strong` role → `text-sm font-semibold`
  (Inter 14px/600, lh 1.45). The boards draw 15px/600 for Button-Primary /
  Button-Outline but 15px is not a canonical scale step (design-tokens.md §1.2:
  "14px is the floor for readable prose"); snap to 14px/600 = `font-semibold`.
  This replaces the current `font-medium` (500).
- **SVG icons within button:** `[&_svg]:size-4` (16px) — not a type token, a
  layout constraint; keep.

### Radius

- Base + `sm` + `lg` sizes: `rounded-[var(--radius)]` (0.625rem / 10px).
  Replaces current `rounded-md` (0.375rem). Boards 04 + 05: `r:$radius`.
- `icon` / `icon-lg` sizes: `rounded-[var(--radius)]` (square icon buttons
  share the same radius as the board's `r:$radius`).

---

## Composition & deps

```
button.tsx
  ├── @radix-ui/react-slot  (Slot — asChild polymorphism)
  ├── class-variance-authority  (cva, VariantProps)
  └── ../lib/utils  (cn — clsx + tailwind-merge)
```

No `@camp404/core` helpers needed — Button is pure presentational. No
`rankLevel` gating; if a consumer needs to gate on rank it passes `disabled`
from outside. `CaptainLock` is the preview-but-locked treatment; Button does
not know about ranks (decision #3).

The `Spinner` atom (`@camp404/ui/spinner.tsx` — PROMOTE) is composed by
consumers inside `children` during loading; it is not imported by `button.tsx`
itself.

---

## Absorbs

No inventory candidates collapse into `Button` — the merge map carries no
entry for Button. The component-library.md confirms Button-Primary and
Button-Outline are both the same canonical component with `variant="default"`
and `variant="outline"` respectively; there are no other named button candidates
to absorb.

**Dropped dead code that references Button (not absorbed, deleted):**
- `apps/web/components/voice/dictate-button.tsx` (`DictateButton`) — marked
  DROPPED in component-library notes. It wraps `Button`; kill the file entirely
  as part of the DictatePill→RecorderPanel consolidation.

---

## Stories & tests

### Storybook stories (extend `button.stories.tsx`)

Current stories cover `Default · Outline · Ghost · Destructive · Secondary ·
Sizes`. Add:

| Story | What it proves |
|---|---|
| `Link` | `variant="link"` renders as underline text without bg |
| `AsChild` | `<Button asChild><a href="/">…</a></Button>` delegates to `<a>` |
| `LoadingState` | `disabled` + Spinner child inside default variant — the consumer-owned loading pattern |
| `IconSize` | `size="icon"` with a single Lucide icon child; `size="icon-lg"` |
| `AllVariants` | Grid of all 6 variants side-by-side for visual regression |
| `DisabledAll` | All variants `disabled` — verify opacity-50 uniform across variants |

### Vitest / RTL tests (`button.test.tsx`)

```
Button — atom
  ✓ renders children
  ✓ applies variant class for each of the 6 variants (data-driven)
  ✓ applies size class for each of the 5 sizes
  ✓ disabled: pointer-events-none + opacity-50 applied; click handler not called
  ✓ asChild: root element is the child element (not <button>)
  ✓ forwards ref to the underlying element
  ✓ merges className prop without clobbering CVA classes
  ✓ native button attrs forwarded (type, name, form, aria-label, aria-pressed)
  ✓ focus-visible ring present (verify ring class applied — JSDOM class check)
```

### a11y notes

- `Button` renders a semantic `<button>` by default — no ARIA role override
  needed.
- `asChild` with `<Link>` renders as `<a>` — confirm the host passes
  `aria-label` when the label is icon-only.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring ring-offset-2`.
  `ring` resolves to `$primary` (hot-magenta) which has sufficient contrast
  against `$background` (midnight-violet) on the dark theme.
- Loading: when consumer renders `disabled + Spinner`, the `<button disabled>`
  communicates state to assistive tech natively; consumer should also update
  `aria-label` or provide visible `sr-only` text (e.g. "Saving, please wait").
  The Button atom itself does not dictate this — it is an organism-level
  responsibility.
- `DictateButton` (the dropped wrapper) used `aria-pressed` on the Button for
  toggle state — that pattern is correct and available to any consumer via
  native `aria-pressed` forwarding.

---

## Build steps

Ordered; each step has its acceptance criterion.

### Step 1 — Fix `rounded-md` → `rounded-[var(--radius)]`

**Change:** In `buttonVariants` base class and in `sm`/`lg` size entries,
replace every `rounded-md` with `rounded-[var(--radius)]`.

**Acceptance:** All rendered Button variants show 10px corner radius (matches
boards 04 + 05). Snapshot / visual test updated.

**Prerequisite:** None — `--radius: 0.625rem` already exists in `globals.css`.

### Step 2 — Fix `font-medium` → `font-semibold`

**Change:** In the CVA base class string, replace `font-medium` with
`font-semibold`.

**Acceptance:** Button label weight is visually 600 (semibold). Stories updated.

**Note:** `text-sm` stays — this resolves the board's 15px draw to the canonical
14px scale step. Do not introduce `text-[15px]`.

### Step 3 — Fix outline base from `bg-background` → `bg-transparent`

**Change:** Outline variant class: `border border-input bg-transparent
hover:bg-accent/15 hover:text-accent-foreground`.

**Acceptance:** Outline button rendered on a `$card` surface shows no opaque
background fill (transparent through to card). Hover applies `accent/15%` tint.

### Step 4 — Fix ghost hover to `hover:bg-accent/15`

**Change:** Ghost variant class: `hover:bg-accent/15 hover:text-accent-foreground`.

**Acceptance:** Ghost hover applies a 15% accent tint, not full `bg-accent`.

### Step 5 — Update Storybook stories

**Change:** Extend `button.stories.tsx` with the new stories listed above
(Link, AsChild, LoadingState, IconSize, AllVariants, DisabledAll). Update
existing Sizes story to include `icon-lg`.

**Acceptance:** All stories render without console errors in Storybook.

### Step 6 — Write/extend vitest tests

**Change:** Create (or extend) `button.test.tsx` covering all test cases listed
above.

**Acceptance:** All test cases pass; coverage includes every CVA variant +
size combination.

### Step 7 — Confirm `ring-offset-background` short-form (defer to foundations pass)

**Change:** This is a `bg-background` token-spelling cleanup (design-tokens.md
reconciliation #22). The `ring-offset-background` utility is Tailwind-generated
and already correct; the verbose form is only in global base styles, not in
`button.tsx` specifically. **Defer** to the foundations-tokens codemod pass —
no change needed in `button.tsx` for this item.

**Acceptance:** No change in this file; tracked in `foundations-tokens.md`.

---

## Consumers

Every molecule, organism, and surface that uses Button in the production app.
Listed by file so the impact of Steps 1–4 (radius + weight + outline/ghost
colour) is traceable.

### Direct `@camp404/ui/components/button` consumers in `apps/web`

| File | Variant(s) used | Notes |
|---|---|---|
| `app/landing-hero.tsx` | `default`, `size="lg"` | Landing CTA |
| `app/auth/sign-in-form.tsx` | `default` (submit), `outline` (Google mark host) | Auth forms |
| `app/auth/sign-up-form.tsx` | `default` (submit), `outline` (Google mark host) | Auth forms |
| `app/pending-approval/page.tsx` | `outline` | Sign-out link |
| `app/error.tsx` | `default` (Try again), `outline` (Home) | ErrorBoundary |
| `app/not-found.tsx` | `default` | 404 page |
| `app/notifications/page.tsx` | `ghost size="sm"` | Back nav |
| `app/family-tree/page.tsx` | `ghost size="sm"` | Back nav |
| `app/family-tree/family-tree.tsx` | `ghost` | Expand/collapse tree |
| `app/captains/tools/page.tsx` | `ghost size="sm"` | Back nav |
| `app/captains/announcements/page.tsx` | `ghost size="sm"` | Back nav |
| `app/captains/camp-management/page.tsx` | `ghost size="sm"` | Back nav |
| `app/captains/announcements/announcements-manager.tsx` | `default`, `outline`, `ghost`, `destructive` | Composer CTA + Edit/Cancel/Delete |
| `app/captains/camp-management/camp-management-roster.tsx` | `default`, `outline`, `destructive` | Approve/Reject/Assign-Captain |
| `app/profile/page.tsx` | `default` | Edit profile link |
| `app/profile/edit/edit-form.tsx` | `default` (Save), `ghost` (Cancel) | Profile edit |
| `app/profile/edit/delete-account.tsx` | `destructive` | Delete account |
| `app/tools/invite/invite-form.tsx` | `default` (Create invite/Copy), `outline` (Send another), `size="icon"` (Shuffle) | Invite tool |
| `app/tools/invite/page.tsx` | `ghost size="sm"` | Back nav |
| `app/acknowledgement-gate.tsx` | `default` | Acknowledge CTA |
| `components/auth-shell.tsx` | — | (hosts children that include Button) |
| `components/push/enable-push.tsx` | `secondary size="sm"` | EnablePush organism |
| `components/questionnaire/wizard.tsx` | `ghost` (Back), `outline` (Back), `default` (Next/Submit) | QuestionnaireWizard footer |
| `components/questionnaire/question.tsx` | `ghost` | Full-screen toggle |
| `components/voice/recorder-panel.tsx` | `outline` (Re-record), `default` (Use this text) | RecorderPanel |
| `components/feedback/report-bug-dialog.tsx` | `default`, `outline`, `ghost`, `destructive` | ReportBugDialog |

### Within `@camp404/ui` itself

| File | Use |
|---|---|
| `components/dialog.tsx` | `Button` for dialog close/action affordances |
| `components/combobox.tsx` | `Button` as the combobox trigger |

### Molecules / organisms that will compose Button after this redesign

`OAuthButton` (PROMOTE) — wraps `outline` Button + `GoogleMark` SVG.  
`DictatePill` (PROMOTE) — no longer uses `DictateButton`; uses `Button outline`
internally.  
`Stepper` (NEW, app-local) — uses `ghost` or `outline` for −/+ actions.  
`SignInForm` / `SignUpForm` / `QuestionnaireWizard` / `InviteForm` /
`AnnouncementsManager` / `MemberProfile` / `AcknowledgementGate` /
`ReportBugDialog` / `ErrorBoundary` / `MCPConsent` / `LandingHero` — all
compose Button for their primary CTA or navigation actions.
