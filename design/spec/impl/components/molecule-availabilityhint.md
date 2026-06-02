# AvailabilityHint — molecule plan

- **mapsTo:** NEW (app-local `apps/web/app/tools/invite/invite-form.tsx`) · Target file: `apps/web/app/tools/invite/availability-hint.tsx`

> **Why app-local, not promoted to `@camp404/ui`:** `component-library.md` §AvailabilityHint explicitly classifies this as `NEW (app-local)`. The component is bound to the invite-tool's `Availability` union type and has a single consumer (`InviteForm`). It carries no logic extractable to `@camp404/core` (the availability state is driven by a fetch side-effect owned by `InviteForm`). Promoting it to `@camp404/ui` would import app-domain vocabulary into the presentation package without meaningful reuse. Keep app-local; factor out from the existing `invite-form.tsx` monolith into its own file.

---

## Current state — does it exist? where? gap vs spec

**Source file (verified):** `apps/web/app/tools/invite/invite-form.tsx:212–255`

The component is a private unexported function inside `invite-form.tsx` — same file as `InviteForm`, `CaptainOptions`, `SuccessPanel`, and the `Availability` type. It is **not** a standalone module and is **not exported**. There is no `availability-hint.tsx` anywhere in the repo.

**Live implementation (lines 212–255) vs spec:**

| Spec requirement | Live code | Gap |
|---|---|---|
| `idle` state → render nothing | `if (!code) return null` — correctly returns null when code is empty; does not have an explicit `state === "idle"` guard (the `Availability` union's `idle` member renders nothing because no branch matches, falling through to `return null`) | Correct by exhaustion; a named guard would be cleaner |
| `checking` → Spinner (`Loader2` xs) + "Checking availability…" ($muted-foreground) | `<Loader2 className="h-3 w-3 animate-spin" />` + text `text-xs text-muted-foreground` | Icon is `Loader2` (h-3 w-3 = 12px); board 23 does not draw the checking state explicitly in the StatesSection, but describes it via the surface brief (11-invite-tool.md §States). No `motion-safe:` guard on animate-spin — spec gap. No `aria-hidden` on spinner — spec gap. |
| `available` → `circle-check` (success green) + "`<code>` is available." (success green) | `<Check className="h-3 w-3" />` — uses `Check` icon not `circle-check`. Text: `text-xs text-emerald-400` — **raw `emerald-400`**, off-token. | **Icon drift:** board draws `circle-check` (lucide); live renders `Check`. **Colour drift:** `text-emerald-400` → must become `text-success` once the `--color-success` token lands (design-tokens.md §2.2 / reconciliation #13). |
| `taken` → `circle-x` ($destructive) + "`<code>` is already taken — pick another." ($destructive) | `<X className="h-3 w-3" />` — uses `X` not `circle-x`. Text: `text-xs text-destructive` | **Icon drift:** `circle-x` vs `X`. Colour is correct (`text-destructive`). |
| `invalid` → `circle-x` ($destructive) + hint string ($destructive) | `<X className="h-3 w-3" />` + `availability.hint` text + `text-xs text-destructive` | **Icon drift:** same — `circle-x` vs `X`. Colour correct. |
| `aria-live` region so screen readers announce state changes | Absent — no `aria-live`, no `role="status"` | **A11y gap.** State changes from `checking → available → taken` happen in-place; no live region announces them. |
| `code` prop used in text interpolation | Used only in `available` and `taken` branches (`{code} is available.` / `{code} is already taken`) | Correct use. |
| Spinner must use `<Spinner>` atom once promoted | Currently inlines `Loader2` | Will resolve after `atom-spinner.md` ships: swap `Loader2` for `<Spinner size="xs" aria-hidden />`. |

**Board 23 `StatesSection` (lines 47–61 of `23-s14-invite-tool.txt`) confirms three rendered states:** `available` (circle-check, `#3fd07a`), `invalid` (circle-x, $destructive), `taken` (circle-x, $destructive). The `checking` state is documented in the surface brief but absent from the StatesSection — the surface brief description is authoritative for that state.

**Token blocker (per component-library.md line 602):** AvailabilityHint cannot be considered token-clean until `--color-success` lands in `globals.css`. The `available` state's `text-emerald-400` must become `text-success`. This is a prerequisite (foundations-tokens.md Phase 0).

---

## API — props, variants, sizes, states

### TS prop interface

```ts
/** Client-only state machine for invite-code availability. */
export type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "invalid"; hint: string };

export interface AvailabilityHintProps {
  /**
   * Current availability state driven by the debounced check in InviteForm.
   * `idle` renders nothing. `checking` renders a spinner + label.
   * `available`/`taken`/`invalid` render an icon + message line.
   */
  availability: Availability;

  /**
   * The current slug value. Used to interpolate the code name into
   * "available" and "taken" messages. Renders nothing when empty string.
   */
  code: string;

  /** Forwarded to the root element for layout overrides from the host. */
  className?: string;
}
```

### Variants

The component has no explicit `variant` prop — state is the sole axis of variation. One rendered shape per availability state:

| State | Icon | Icon tone | Text | Text tone |
|---|---|---|---|---|
| `idle` | — | — | — (renders nothing) | — |
| `checking` | `Loader2` (Spinner xs, animate) | `$muted-foreground` (inherited) | "Checking availability…" | `$muted-foreground` |
| `available` | `circle-check` (lucide) | `$success` | "`<code>` is available." (code part in `font-mono`) | `$success` |
| `taken` | `circle-x` (lucide) | `$destructive` | "`<code>` is already taken — pick another." (code part in `font-mono`) | `$destructive` |
| `invalid` | `circle-x` (lucide) | `$destructive` | `availability.hint` string | `$destructive` |

### Sizes

One size only: `text-xs` (12px Inter) for the label + `size-3` (12px) icon. This aligns with `--text-caption`/`--text-micro` territory (design-tokens.md §1.1) — a sub-label hint beneath a form field, not a standalone body text role.

### States

Exhaustively covered by the `Availability` union. No disabled state (the component is purely display-side; the `InviteForm` disables the CreateBtn when `checking`, `taken`, or `invalid` — that gate lives in the parent).

---

## Tokens & type — exact design tokens + type-scale roles

All tokens in short Tailwind utility form (design-tokens.md §4 reconciliation #22). No raw hex. No `emerald-*`/`amber-*`/`sky-*`/`rose-*`.

### Colours

| Slot | Token / utility | Source |
|---|---|---|
| `checking` text + icon | `text-muted-foreground` | Board 23 `$muted-foreground`; Spinner inherits `currentColor` |
| `available` text + icon | `text-success` | Board 23 `#3fd07a` → `$success` (design-tokens.md §2.2 + reconciliation #13). **Requires `--color-success` in `globals.css` first.** |
| `taken` text + icon | `text-destructive` | Board 23 `$destructive` |
| `invalid` text + icon | `text-destructive` | Board 23 `$destructive` |

### Typography

| Element | Role | Token / utility |
|---|---|---|
| All hint text | Caption / muted (design-tokens.md `--text-caption`) | `text-xs` = 12px, weight 400 (normal) |
| Inline `<code>` in available/taken messages | Mono data | `font-mono` (JetBrains Mono via `--font-mono` once §1.3 ships) |

The `font-mono` on the inline slug matches the board's JetBrains Mono treatment for the `CodeInput` slug (board 23, `CodeInput` text `[JetBrains Mono/14px/normal/$foreground]`). The hint message interpolates the same slug, so it also uses `font-mono` for the code span — this is consistent with decision #2 (mono = deliberate data-console face for invite slugs).

### Layout

| Property | Value | Source |
|---|---|---|
| Row layout | `flex items-center gap-1.5` | Board 23 `AvailHint {gap:6 ai:center}` — gap 6 ≈ `gap-1.5` (Tailwind 1.5 = 6px) |
| Root element | `<p>` with `role="status"` and `aria-live="polite"` | A11y fix; `<p>` is the live element whose content changes |

---

## Composition & deps

### Atom/primitive dependencies

| Dep | Package | Role |
|---|---|---|
| `Spinner` | `packages/ui/src/components/spinner.tsx` (after `atom-spinner.md` ships) | `checking` state — `size="xs"` (`h-3 w-3`), `aria-hidden`, `inline` variant |
| `CircleCheck`, `CircleX` | `lucide-react` | `available` and `taken`/`invalid` icons |
| `cn` | `@camp404/ui/lib/utils` | Class merging for `className` forwarding |

**Until `atom-spinner.md` ships:** use `<Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />` directly (mirrors the current live pattern, but adds `motion-safe:` and `aria-hidden`).

### `@camp404/core` helpers

None required. `AvailabilityHint` is a pure display component — it maps a prop value to JSX. No `rankLevel`, `initialsFrom`, or domain logic. The `Availability` type is UI-only (not persisted).

**`"use client"` not required** — the component receives props, renders JSX, and has no event handlers or browser APIs. It is safe to use in both server and client contexts. The parent `InviteForm` is already `"use client"` so it will always be rendered client-side in practice, but `AvailabilityHint` itself carries no `"use client"` directive.

---

## Absorbs

The merge map in `component-library.md` (lines 37–48) has **no row** that names `AvailabilityHint` as a canonical that absorbs other candidates. There are no duplicate inventory candidates to collapse — this is a first-occurrence NEW component with a single source (`invite-form.tsx`).

The refactor step replaces the private function `AvailabilityHint` inside `invite-form.tsx` with an import from the new standalone file. No other file in the repo uses an availability-hint pattern.

---

## Stories & tests

### Storybook stories (`availability-hint.stories.tsx`)

Locate at `apps/web/app/tools/invite/availability-hint.stories.tsx` (co-located with the module; `apps/web` Storybook config).

| Story | Props | Purpose |
|---|---|---|
| `Idle` | `availability={{state:"idle"}}`, `code=""` | Renders nothing — confirms null return |
| `Checking` | `availability={{state:"checking"}}`, `code="neon-toaster-mongoose"` | Spinner + "Checking availability…" |
| `Available` | `availability={{state:"available"}}`, `code="neon-toaster-mongoose"` | circle-check + success green message with mono slug |
| `Taken` | `availability={{state:"taken"}}`, `code="neon-toaster-mongoose"` | circle-x + destructive "…already taken…" with mono slug |
| `Invalid` | `availability={{state:"invalid", hint:"3–48 chars, lowercase letters / digits / hyphens."}}`, `code="BAD CODE"` | circle-x + destructive hint string (no code interpolation) |
| `LongSlug` | `availability={{state:"available"}}`, `code="my-extremely-long-invite-code-slug-name-here"` | Confirm text wraps gracefully, mono slug doesn't overflow |
| `StateTransition` | interactive controls; default `checking` | For manual toggling through all states in the addon controls panel |

### Vitest / RTL tests (`availability-hint.test.tsx`)

Co-located at `apps/web/app/tools/invite/availability-hint.test.tsx`.

| Test case | Assertion |
|---|---|
| `idle` state renders nothing | `render(<AvailabilityHint availability={{state:"idle"}} code="" />); expect(container.firstChild).toBeNull()` |
| empty `code` with any non-idle state renders nothing | `availability={{state:"available"}}`, `code=""` → null (guards against empty-string interpolation) |
| `checking` renders spinner | `getByRole('status')` exists; text "Checking availability…" present |
| `checking` Spinner has `aria-hidden` | `container.querySelector('[aria-hidden="true"]')` present (spinner decorative) |
| `available` renders circle-check icon | icon with `data-testid` or `aria-hidden`; text contains "is available." |
| `available` interpolates code in mono span | `getByText("neon-toaster-mongoose")` has class `font-mono` |
| `taken` renders circle-x icon; text contains "already taken" | `getByText(/already taken/)` present |
| `taken` interpolates code in mono span | `getByText("neon-toaster-mongoose")` has class `font-mono` |
| `invalid` renders circle-x icon + hint string | `getByText("3–48 chars, lowercase letters / digits / hyphens.")` present |
| `invalid` does NOT interpolate `code` in the message | no `font-mono` span wrapping the code when state is `invalid` |
| root `<p>` has `role="status"` when non-idle | `getByRole('status')` present for `checking`, `available`, `taken`, `invalid` |
| `className` prop merges onto root element | custom class coexists with base classes |

### A11y notes

- The root `<p>` carries `role="status"` and `aria-live="polite"`. This ensures assistive technology announces each state change as availability resolves (checking → available / taken / invalid). A `polite` region does not interrupt ongoing speech — appropriate for a debounced hint that updates automatically.
- The Spinner in the `checking` state is `aria-hidden={true}` — it is decorative; the adjacent text "Checking availability…" conveys the state.
- The `circle-check` / `circle-x` icons are `aria-hidden={true}` — the adjacent text message is the semantic content.
- The inline `<span className="font-mono">` wrapping the slug is presentational; no additional ARIA annotation needed.
- Colour alone does not convey the state — each branch has a distinct icon (circle-check vs circle-x vs spinner) and distinct text, satisfying WCAG 1.4.1 (use of colour).

---

## Build steps

### Prerequisite

**`--color-success` token must be in `packages/ui/src/styles/globals.css`** before the `available` branch ships in token-clean form. This is tracked in `foundations-tokens.md` (design-tokens.md §2.2, Phase 0). Until it lands, the `available` branch must use a temporary `text-[oklch(0.78_0.17_155)]` inline or keep `text-emerald-400` behind a TODO comment. The preferred path: ship the token first (blocked on foundations); then ship this component.

### Step 1 — Define `Availability` type in a shared module

Extract the `Availability` union type from `invite-form.tsx:23–28` into a co-located types file:
`apps/web/app/tools/invite/types.ts`

```ts
export type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "invalid"; hint: string };
```

**Acceptance:** `invite-form.tsx`, `availability-hint.tsx`, and any tests can import `Availability` from `./types` without circular dependency.

### Step 2 — Create `apps/web/app/tools/invite/availability-hint.tsx`

Build the component to the board 23 + surface brief spec:

- Import `Availability` from `./types`.
- Import `CircleCheck`, `CircleX` from `lucide-react`.
- Import `Loader2` from `lucide-react` (until `<Spinner>` ships; then swap to `<Spinner size="xs" aria-hidden>`).
- Import `cn` from `@camp404/ui/lib/utils`.
- Guard: if `!code` return `null`. If `availability.state === "idle"` return `null`.
- Root element: `<p role="status" aria-live="polite" className={cn("flex items-center gap-1.5 text-xs", ...tone, className)}>`.
- `checking`: `<Loader2 className="size-3 motion-safe:animate-spin" aria-hidden="true" />` + `<span>Checking availability…</span>`, tone `text-muted-foreground`.
- `available`: `<CircleCheck className="size-3 shrink-0" aria-hidden="true" />` + `<span><span className="font-mono">{code}</span> is available.</span>`, tone `text-success`.
- `taken`: `<CircleX className="size-3 shrink-0" aria-hidden="true" />` + `<span><span className="font-mono">{code}</span> is already taken — pick another.</span>`, tone `text-destructive`.
- `invalid`: `<CircleX className="size-3 shrink-0" aria-hidden="true" />` + `<span>{availability.hint}</span>`, tone `text-destructive`.
- Export named `AvailabilityHint` and `AvailabilityHintProps`.
- No `"use client"` directive (pure display).

**Acceptance:** `pnpm --filter apps/web typecheck` passes; no raw hex; `text-emerald-400` replaced by `text-success`; `motion-safe:animate-spin` on spinner; all five states compile.

### Step 3 — Refactor `invite-form.tsx` to import from new module

- Remove the private `AvailabilityHint` function from `invite-form.tsx` (lines 212–255).
- Remove the local `Availability` type definition (lines 23–28).
- Add imports: `import { AvailabilityHint } from "./availability-hint"` and `import type { Availability } from "./types"`.
- Verify the `<AvailabilityHint availability={availability} code={code} />` call-site at line 176 is unchanged.

**Acceptance:** `pnpm --filter apps/web typecheck` and `pnpm --filter apps/web lint` pass; `invite-form.tsx` no longer contains the private `AvailabilityHint` function; no duplicate `Availability` type definition in the file.

### Step 4 — Write tests (`availability-hint.test.tsx`)

Write all eleven test cases from the matrix above.

**Acceptance:** `pnpm --filter apps/web test` (or equivalent vitest run for the `tools/invite` folder) green; all eleven cases pass.

### Step 5 — Write Storybook stories (`availability-hint.stories.tsx`)

Write the seven stories listed above.

**Acceptance:** Storybook renders all stories without console errors; `Idle` story renders an empty container; colour of `Available` story is visually `$success` (green), not raw emerald.

### Step 6 — Token validation (post-foundations)

Once `--color-success` is confirmed in `globals.css` (foundations-tokens.md Phase 0):
- Run `grep -n "emerald" apps/web/app/tools/invite/availability-hint.tsx` — must return no results.
- Run visual diff of the `Available` story before/after — confirm the green matches `$success`.

**Acceptance:** no `emerald-*` utilities remain; the available state renders in the canonical success token colour.

---

## Consumers

`AvailabilityHint` has a single consumer, by spec and by code audit.

| Consumer | File | Role |
|---|---|---|
| `InviteForm` | `apps/web/app/tools/invite/invite-form.tsx:176` | Renders the availability line beneath the `CodeInput` + `ShuffleBtn` row inside `CodeField` |

There are no other surfaces in the app that run a live slug-availability check. The `surface-library.md` entry for AvailabilityHint explicitly scopes it to "invite-tool (code availability line)" (`component-library.md:267`). No additional consumers are anticipated; if a future surface needs the same pattern (e.g. a username availability check), a new component should be introduced rather than generalising this one — the `Availability` union is semantically invite-code-specific.
