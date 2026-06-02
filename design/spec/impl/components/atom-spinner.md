# Spinner — atom plan

- **mapsTo:** PROMOTE (hand-rolled per-surface in `apps/web`) · Target file: `packages/ui/src/components/spinner.tsx`

---

## Current state — does it exist? where? gap vs spec

`packages/ui/src/components/` has **no `spinner.tsx`**. The pattern is inlined in
eight separate files across `apps/web`, each importing `Loader2` from `lucide-react`
and writing `animate-spin` inline. No shared abstraction exists today.

**Confirmed inline instances (grounded — all files read):**

| File | Pattern | Size class |
|---|---|---|
| `apps/web/components/profile/avatar-upload.tsx:102` | `<Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />` inside an `overlay` `div` | 32 px |
| `apps/web/components/voice/recorder-panel.tsx:101` | `<Loader2 className="h-6 w-6 animate-spin" />` inside `Button` (processing/requesting states) | 24 px |
| `apps/web/components/voice/dictate-button.tsx:74` | `<Loader2 className="h-3.5 w-3.5 animate-spin" />` inside `Button` (busy state) | 14 px |
| `apps/web/app/acknowledgement-gate.tsx:150` | `{acking && <Loader2 className="h-4 w-4 animate-spin" />}` inside `Button` | 16 px |
| `apps/web/components/feedback/report-bug-dialog.tsx:274` | `{isPending && <Loader2 className="h-4 w-4 animate-spin" />}` inside `Button` | 16 px |
| `apps/web/app/captains/announcements/announcements-manager.tsx:265` | `<Loader2 className="h-4 w-4 animate-spin" />` inside `Button` | 16 px |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx:408` | `<Loader2 className="h-5 w-5 animate-spin" />` centred in `py-10` container (panel loading state) | 20 px |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx:480` | `<Loader2 className="h-4 w-4 animate-spin" />` inside action `Button` | 16 px |
| `apps/web/app/tools/invite/invite-form.tsx:200` | `<Loader2 className="animate-spin" />` inside `Button` (no size class — inherits `[&_svg]:size-4`) | 16 px (inherited) |
| `apps/web/app/tools/invite/invite-form.tsx:223` | `<Loader2 className="h-3 w-3 animate-spin" />` in `AvailabilityHint` paragraph | 12 px |

**Gaps vs spec:**

1. **No reduced-motion guard.** No instance wraps the spin in `motion-safe:` or
   checks `prefers-reduced-motion`. The spec mandates this guard.
2. **No consistent `aria-label`.** `avatar-upload.tsx` passes `aria-hidden`
   (correct for overlay); all other sites omit both `aria-hidden` and `aria-label` —
   spec requires either `aria-label` on the component or `aria-hidden` propagation.
3. **Colour inconsistency.** `avatar-upload.tsx` hard-codes `text-white` (off-token).
   All other sites inherit `currentColor` — this is the correct default. The
   `text-white` will be absorbed and replaced with the token-based overlay variant.
4. **No size system.** Sizes range from 12 px to 32 px with no named steps — each
   caller inlines their own `h-N w-N`. The canonical set is three steps (xs 12 / sm 16 /
   md 24 / lg 32) derived by collapsing the actual pixel values in use.
5. **No centred variant.** The `camp-management-roster.tsx:408` pattern of a spinner
   centred in a flex container with `py-10` is not yet a named variant — the spec
   names it `centred` (panel/page load state).

---

## API — props, variants, sizes, states

```ts
interface SpinnerProps {
  /**
   * Named size step. Defaults to "sm".
   * xs = 12 px  — AvailabilityHint checking line
   * sm = 16 px  — in-button (buttons, action rows)   ← default
   * md = 24 px  — voice recorder-panel button busy state
   * lg = 32 px  — avatar overlay, panel centred state
   */
  size?: "xs" | "sm" | "md" | "lg";

  /**
   * Accessible label. When used inside a Button (which has its own label)
   * set aria-hidden via this prop. Required for standalone spinners.
   * Default: undefined (caller must supply one of the two).
   */
  "aria-label"?: string;

  /**
   * When true, renders aria-hidden="true" (the spinner is purely decorative;
   * the containing element already describes the state).
   * Mutually exclusive with aria-label.
   */
  "aria-hidden"?: true;

  /** Forwarded to the root element for positioning overrides. */
  className?: string;
}
```

**Variants (via `variant` prop, `"inline"` default):**

| Variant | Description | Canonical usage |
|---|---|---|
| `inline` | `currentColor` icon, inline-flex, no wrapper — drops directly into a flex Button or text line | button loading states, AvailabilityHint |
| `overlay` | absolute-positioned, centred in nearest `relative` ancestor; colour `text-foreground` (not `text-white`) | avatar-upload uploading scrim |
| `centred` | block, `flex items-center justify-center py-10`; colour `text-muted-foreground` | roster member-detail panel loading, any async panel |

**Sizes (Tailwind utility mapping):**

| Prop value | Tailwind | px |
|---|---|---|
| `xs` | `size-3` | 12 |
| `sm` | `size-4` | 16 |
| `md` | `size-6` | 24 |
| `lg` | `size-8` | 32 |

**States:** spinning only — Spinner is never "stopped" in the DOM; callers
conditionally mount/unmount it. Reduced-motion: when `prefers-reduced-motion:
reduce` is active, `animate-spin` must be suppressed — use `motion-safe:animate-spin`.

---

## Tokens & type — exact design tokens + type-scale roles

Spinner is **purely presentational** — it carries no visible text and no fill
colour of its own. It inherits `currentColor` from its parent in the `inline`
variant.

| Slot | Token | Notes |
|---|---|---|
| Stroke colour — inline | `currentColor` (inherits parent) | Correct; matches button `text-primary-foreground`, muted-foreground in panels, etc. |
| Stroke colour — centred variant | `text-muted-foreground` | Matches the panel loading pattern in `camp-management-roster.tsx:408` |
| Stroke colour — overlay variant | `text-foreground` | Replaces the hard-coded `text-white` in `avatar-upload.tsx:102`; `text-foreground` = `oklch(0.97 0.02 330)` — near-white on the dark palette without an off-token |
| Animation | `motion-safe:animate-spin` | Tailwind utility; no raw CSS needed |

**Typography:** none — Spinner renders no text. No type-scale role applies.

**No raw hex, no `emerald/amber/sky/rose` utilities, no `text-white`.**

---

## Composition & deps

- **`lucide-react` `Loader2`** — the single icon; no other primitive.
- **`cn`** from `@camp404/ui/lib/utils` — merges `className` overrides.
- **No `@camp404/core` helpers** — Spinner is stateless + logic-free. It does not
  call `rankLevel` or any domain function.
- **No Radix UI primitive** — a plain `span` wrapper suffices for the overlay and
  centred variants; the icon is the semantic actor.

Dependency tree: `spinner.tsx` → `lucide-react`, `../lib/utils`. Zero runtime deps
on `@camp404/db` or `next/*` (complies with the `@camp404/ui` layering rule).

---

## Absorbs

The merge map has no named spinner candidates (no entry in the merge table). The
component collapses the following identical inline patterns — all resolved to a
single import after promotion:

| Absorbed inline pattern | File |
|---|---|
| `<Loader2 className="h-4 w-4 animate-spin" />` (× 4 files) | `acknowledgement-gate.tsx`, `report-bug-dialog.tsx`, `announcements-manager.tsx`, `camp-management-roster.tsx` (action button) |
| `<Loader2 className="h-6 w-6 animate-spin" />` | `recorder-panel.tsx` |
| `<Loader2 className="h-3.5 w-3.5 animate-spin" />` | `dictate-button.tsx` (snaps to `xs` 12 px — nearest step) |
| `<Loader2 className="h-3 w-3 animate-spin" />` | `invite-form.tsx` AvailabilityHint (size `xs`) |
| `<Loader2 className="animate-spin" />` (no size class) | `invite-form.tsx` Create button (resolves to `sm` via Button `[&_svg]:size-4`) |
| `<Loader2 className="h-5 w-5 animate-spin" />` | `camp-management-roster.tsx` centred panel (snaps to `md` 24 px — nearest step) |
| `<Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />` | `avatar-upload.tsx` overlay (size `lg`, variant `overlay`) |

Size-snapping rationale: the three off-step values (12, 14, 20 px) snap to the
nearest canonical step (12→`xs`, 14→`xs`, 20→`md`). Callers whose Button already
controls size via `[&_svg]:size-4` pass no size prop (inherits from Button context).

---

## Stories & tests

### Storybook stories (`spinner.stories.tsx`)

```text
- Default          — variant="inline" size="sm"; no args
- AllSizes         — row: xs / sm / md / lg, inline variant
- AllVariants      — columns: inline (on dark card), overlay (on relative box), centred
- InButton         — Button with Spinner + "Saving…" label (replicates real usage)
- AvailabilityLine — inline xs + "Checking availability…" text (replicates invite-form)
- ReducedMotion    — story with prefers-reduced-motion:reduce; animation class absent
```

### Vitest / RTL tests (`spinner.test.tsx`)

| Test case | Assertion |
|---|---|
| Renders `Loader2` icon | `getByRole('img', {name: …})` or presence in DOM |
| `aria-label` forwarded | `getByLabelText('Loading…')` when `aria-label="Loading…"` |
| `aria-hidden` forwarded | `container.querySelector('[aria-hidden="true"]')` when prop set |
| Size `xs` maps to `size-3` | class on root element |
| Size `lg` maps to `size-8` | class on root element |
| `motion-safe:animate-spin` class present | not `animate-spin` alone |
| `variant="overlay"` renders absolute wrapper | class `absolute inset-0` on wrapper |
| `variant="centred"` renders flex container | class `flex items-center justify-center` |
| `className` merges without clobber | custom class coexists with variant class |

### A11y notes

- Every standalone `Spinner` (not inside a Button or labelled container) **must**
  receive an `aria-label` prop — e.g. `aria-label="Loading member detail"`.
- Spinners that are purely decorative companions to adjacent text (AvailabilityHint
  "Checking availability…") receive `aria-hidden={true}`.
- Spinners inside `Button` are covered by the Button's own accessible name; pass
  `aria-hidden={true}` there too.
- The `centred` variant is typically the only visible content during a load state;
  an `aria-live="polite"` region on the parent container (not on Spinner itself) is
  the correct escalation path — Spinner makes no assumptions about live regions.

---

## Build steps

1. **Create `packages/ui/src/components/spinner.tsx`**
   - `SpinnerProps` interface (as above).
   - `cva` variant map: `inline` (default) / `overlay` / `centred`.
   - Size map: `xs=size-3` / `sm=size-4` / `md=size-6` / `lg=size-8`.
   - Inline variant: returns `<Loader2 className={cn(sizeClass, 'motion-safe:animate-spin', className)} {...ariaProps} />` — no wrapper.
   - Overlay variant: wraps icon in `<span className="absolute inset-0 flex items-center justify-center">`.
   - Centred variant: wraps icon in `<span className="flex items-center justify-center py-10">`.
   - Forwards `aria-label` **or** `aria-hidden` (not both) to the icon element.
   - **Acceptance criteria:** file exists; `pnpm --filter @camp404/ui build` passes; no raw hex or `text-white` in the file.

2. **Export from `packages/ui/src/index.ts`**
   - Add `export { Spinner, type SpinnerProps } from './components/spinner'`.
   - **Acceptance criteria:** `import { Spinner } from '@camp404/ui'` resolves in `apps/web` TS check.

3. **Write `spinner.stories.tsx`** (all six stories listed above).
   - **Acceptance criteria:** Storybook renders all stories without console errors; ReducedMotion story shows a static icon.

4. **Write `spinner.test.tsx`** (all nine cases listed above).
   - **Acceptance criteria:** `pnpm --filter @camp404/ui test` passes; all nine cases green.

5. **Migrate inline usages in `apps/web`**
   - Replace all eight call-sites (nine `Loader2` imports across eight files) with
     `import { Spinner } from '@camp404/ui'` + `<Spinner …>` with the correct
     `size` and `variant` props per the absorb table above.
   - Remove now-unused `Loader2` imports from each file.
   - **Acceptance criteria:** `pnpm --filter apps/web typecheck` passes; no `Loader2`
     import remains outside `spinner.tsx`; `grep -r "h-4 w-4 animate-spin" apps/web`
     returns no hits.

6. **Token cleanup: remove `text-white` from `avatar-upload.tsx`**
   - The overlay spinner there hard-codes `text-white`; after migration, the
     `variant="overlay"` class supplies `text-foreground`. Remove the `text-white`
     override.
   - **Acceptance criteria:** `avatar-upload.tsx` has no `text-white`; visual diff
     confirms near-identical rendering on dark palette.

---

## Consumers

After promotion, `<Spinner>` is used by the following components/organisms (all
currently inlining the pattern):

| Consumer | Usage | Variant / size |
|---|---|---|
| `AvatarUpload` molecule | Uploading scrim over the avatar circle | `overlay` · `lg` |
| `RecorderPanel` molecule | `requesting` + `processing` states inside the record `Button` | `inline` · `md` |
| `DictatePill` / `dictate-button` | `busy` state inside the dictate `Button` | `inline` · `xs` |
| `AcknowledgementGate` organism | `acking` state inside the Acknowledge `Button` | `inline` · `sm` |
| `ReportBugDialog` organism | `isPending` state inside the submit `Button` | `inline` · `sm` |
| `AnnouncementsManager` organism | `pending` state inside the Save-draft `Button` | `inline` · `sm` |
| `MemberProfile` / roster action buttons | `isPending` state inside Approve/Reject `Button` | `inline` · `sm` |
| Roster member-detail panel loading | `detail.state === "loading"` centred in `max-h-[45vh]` container | `centred` · `md` |
| `AvailabilityHint` molecule | `checking` state inline in text line | `inline` · `xs` |
| `InviteForm` organism | `isPending` Create-invite `Button` | `inline` · `sm` |

Future consumers (introduced by redesign, not yet built):

| Consumer | Planned usage |
|---|---|
| `IconBadge` (`spinner-overlay` state in spec) | Host-driven spinner over icon during async action |
| Any NEW organism with async submission | Should use `<Spinner size="sm" aria-hidden>` inside its Button's loading branch |
