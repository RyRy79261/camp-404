# OAuthButton — molecule plan

- **mapsTo:** PROMOTE (`apps/web/app/auth/sign-in-form.tsx` + `apps/web/app/auth/sign-up-form.tsx`) — `GoogleMark` SVG is verbatim-duplicated in both files; the `<button>` in `apps/web/app/mcp/connect/page.tsx` is a third hand-rolled variant (no `Button` component, no `GoogleMark`, no shared label).
- **Target file:** `packages/ui/src/components/google-button.tsx`

---

## Current state — does it exist? where? gap vs spec

**`packages/ui/src/components/google-button.tsx` — does NOT exist.** Verified by
listing `packages/ui/src/components/` — no `google-button.tsx` is present.

The pattern is independently reinvented in three `apps/web` files:

| File | Pattern | Gap |
|---|---|---|
| `apps/web/app/auth/sign-in-form.tsx:160–188` | `<Button variant="outline" className="w-full">` + local `GoogleMark` SVG (function at file bottom, lines 174–188). Label: "Continue with Google". | `GoogleMark` is a private file-local function. Outline-button composes correctly. |
| `apps/web/app/auth/sign-up-form.tsx:153–191` | Identical `<Button variant="outline" className="w-full">` + **verbatim-duplicate** `GoogleMark` SVG (lines 177–191). Label: "Continue with Google". | Exact copy of sign-in's SVG — the duplication the spec calls out. |
| `apps/web/app/mcp/connect/page.tsx:62–69` | Plain `<button>` with bespoke `className="mt-4 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 py-2 text-sm font-medium"`. No `Button` component, no `GoogleMark`. Label: "Sign in with Google". | Does not use `@camp404/ui/button`; off-token verbose classes; no Google mark; lowest-fidelity of the three. |

**`GoogleMark` SVG identity:** The SVG in both auth forms is the single-path
"G" glyph (`viewBox="0 0 24 24"`, `h-4 w-4 shrink-0`, `fill="currentColor"`,
`aria-hidden`). The `design/spec/design-tokens.md §4 reconciliation #20` documents
this as a **sanctioned brand-exception colour** — the `#4285F4` Google blue mentioned
there applies to the coloured-pill Google "G" in the MCP consent page; the auth-form
glyph renders in `currentColor` (inherits the outline-button foreground), which is
already token-correct and stays unchanged.

**Gap summary:**

- `GoogleMark` SVG is duplicated verbatim across `sign-in-form.tsx` and `sign-up-form.tsx`; extracting it once eliminates the drift risk.
- `apps/web/app/mcp/connect/page.tsx` uses a raw `<button>` element: no `Button` atom, no `GoogleMark`, verbose off-token class string. Must be replaced.
- No shared `disabled` state contract across the three callers — each manages `loading` locally and passes `disabled={loading}` on the button; the molecule standardises this.
- No shared accessible `aria-label` / `aria-busy` pattern.

---

## API — props, variants, sizes, states

```ts
export interface OAuthButtonProps {
  /** Handler called when the button is activated. */
  onClick: () => void;
  /**
   * Button label text.
   * @default "Continue with Google"
   */
  label?: string;
  /**
   * Whether the button is disabled (e.g. while a form is submitting).
   * @default false
   */
  disabled?: boolean;
  /** Additional class names forwarded to the underlying Button. */
  className?: string;
}
```

**Variants:** single (`variant="outline"`) — no variant prop needed; the component's
purpose is one action (OAuth with Google). The spec entry has `Variants: default` and
no additional variants.

**Sizes:** inherits `Button` `size="default"` (`h-10 px-4 py-2`). No size prop
exposed — both auth surfaces and the MCP bridge use the default height.

**States:**

| State | Visual | Notes |
|---|---|---|
| `default` | Outline button, Google glyph + label | Standard idle state |
| `disabled` | `opacity-50 pointer-events-none` (Button atom's built-in disabled treatment) | Set while containing form submits / OAuth redirect in flight |
| `error` | Rendered by host `Alert` — not inside this molecule | Per spec: "error (host Alert)"; the button itself has no error state |

---

## Tokens & type — exact design tokens + type-scale roles used

**Colour tokens (all from `packages/ui/src/styles/globals.css` `@theme`):**

| Usage | Token | Source |
|---|---|---|
| Button border | `border-input` (`--color-input`) | Inherited from `Button variant="outline"` |
| Button background | `bg-background` (`--color-background`) | Inherited from `Button variant="outline"` |
| Button hover fill | `hover:bg-accent` / `hover:text-accent-foreground` | Inherited from `Button variant="outline"` |
| Button foreground (label + glyph `currentColor`) | `text-foreground` (default) → `text-accent-foreground` on hover | Inherited from `Button variant="outline"` |
| Focus ring | `ring-ring` (`--color-ring` = `--color-primary`) | Inherited from `Button` base CVA |
| Disabled opacity | `opacity-50` | Inherited from `Button` base CVA |

**Google "G" glyph colour:** `fill="currentColor"` — resolves to the button's
foreground token, not a literal hex. The `#4285F4` sanctioned exception
(`design-tokens.md §4 rec #20`) applies to the coloured `<circle fill="#4285F4">` icon
badge on the MCP consent HTML page (`/api/mcp/oauth/authorize`), which is a raw server
HTML response outside the React component tree and outside this molecule's scope.

**Typography:**

| Element | Role | Spec value |
|---|---|---|
| Button label ("Continue with Google") | `--text-body-strong` | Inter 14px / weight 500–600 / lh 1.45 — as drawn on the S24 board's button rows and noted in `design-tokens.md §1.1` |
| Google glyph SVG | `--text-mono` (JetBrains Mono 15/700) | `design-tokens.md §1.1` documents "Google 'G' (15/700)" under mono-data. The SVG itself renders as a 16×16 icon (`h-4 w-4`); the mono-data role applies to the `<text>` form of the "G" on the consent page, not the path-SVG here. The path-SVG is `aria-hidden` and carries no typographic role — `currentColor` is correct. |

---

## Composition & deps — atoms/primitives + `@camp404/core` helpers

```text
OAuthButton
├── Button            (packages/ui/src/components/button.tsx — REUSE atom)
│   └── Slot          (@radix-ui/react-slot — existing dep)
│   └── cn            (packages/ui/src/lib/utils.ts)
│   └── cva / CVA     (class-variance-authority — existing dep)
└── GoogleMark        (internal sub-component, file-private SVG — exported separately
                       so organisms can import the mark independently if needed)
```

**`@camp404/core` helpers used:** none. `OAuthButton` is pure presentation — no
rank logic, no clearance check, no auth state. The `onClick` handler is provided by
the caller (`SignInForm`, `SignUpForm`, `MCPConnectInner`); the molecule fires it
on `type="button"` click. No `@camp404/core` or `@camp404/db` imports are permitted
(`packages/ui` must never import `db` or `next/*` — `architecture.md` hard rule).

**`GoogleMark` export strategy:** define as a named export alongside `OAuthButton`
so organisms (`SignInForm`, `SignUpForm`, future surfaces) can import it directly if
they need the SVG standalone. Keep it `aria-hidden`; the accessible name is always
supplied by the visible button label.

---

## Absorbs — candidates replaced from the merge map

The merge map does not list a named merge group for `OAuthButton`; the spec entry
absorbs the three distinct inline implementations confirmed above:

| Absorbed / replaced | Location | Action |
|---|---|---|
| File-local `GoogleMark` function | `apps/web/app/auth/sign-in-form.tsx:174–188` | Delete; replace `<Button>…<GoogleMark/> Continue with Google</Button>` with `<OAuthButton onClick={handleGoogle} disabled={loading} />` |
| File-local `GoogleMark` function (verbatim copy) | `apps/web/app/auth/sign-up-form.tsx:177–191` | Same — delete and replace |
| Bespoke `<button>` OAuth trigger | `apps/web/app/mcp/connect/page.tsx:62–69` | Replace with `<OAuthButton onClick={onGoogle} label="Sign in with Google" />` |

No other files in `apps/web` contain a `GoogleMark` or inline Google OAuth button
(confirmed by grep — the three files above are the full set).

---

## Stories & tests — Storybook + vitest/RTL; a11y notes

### Storybook stories (`packages/ui/src/components/google-button.stories.tsx`)

```ts
// Story file outline (types and meta only; no runnable code this pass)

import type { Meta, StoryObj } from "@storybook/react";
import { OAuthButton } from "./google-button";

const meta: Meta<typeof OAuthButton> = {
  title: "Molecules/OAuthButton",
  component: OAuthButton,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof OAuthButton>;

export const Default: Story = {
  args: { label: "Continue with Google", disabled: false },
};
export const SignIn: Story = {
  args: { label: "Sign in with Google" },
};
export const Disabled: Story = {
  args: { label: "Continue with Google", disabled: true },
};
export const FullWidth: Story = {
  args: { label: "Continue with Google", className: "w-full" },
};
```

### vitest / RTL test cases

```ts
// Test outline (describe blocks + test names; no executable code this pass)

describe("OAuthButton", () => {
  // Rendering
  it("renders the default label 'Continue with Google'")
  it("renders a custom label when label prop is provided")
  it("renders the Google SVG glyph (aria-hidden)")
  it("renders as an outline button (has border class)")

  // Interaction
  it("calls onClick when clicked in default state")
  it("does NOT call onClick when disabled")

  // Disabled state
  it("has disabled attribute when disabled=true")
  it("has opacity-50 and pointer-events-none classes when disabled")

  // Accessibility
  it("has accessible name from visible label text (no aria-label needed)")
  it("SVG glyph has aria-hidden=true")
  it("has role=button (implicit from <button> element)")
  it("is keyboard-focusable when not disabled")
  it("shows focus-visible ring on keyboard focus")
})

describe("GoogleMark", () => {
  it("renders an SVG with aria-hidden")
  it("has h-4 w-4 dimensions")
  it("uses fill='currentColor'")
})
```

### Accessibility notes

- The button's accessible name is derived from its visible text label ("Continue with Google" / "Sign in with Google") — no additional `aria-label` is required.
- The Google SVG glyph must carry `aria-hidden="true"` (confirmed present in both existing auth-form implementations) so screen readers do not announce "image" alongside the label.
- `type="button"` is mandatory — the molecule renders inside `<form>` elements in its primary consumers; omitting `type` would make it a submit trigger.
- `disabled` state: the underlying `Button` atom already applies `disabled:pointer-events-none disabled:opacity-50` via CVA; no additional ARIA annotation needed for the `disabled` HTML attribute (which already marks the element as non-interactive to AT).
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` is inherited from the `Button` atom's CVA base class.

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** Phase 0 (foundations — status tokens, font wiring, radius tokens in
`globals.css`) is NOT a gate for this molecule because `OAuthButton` consumes only
pre-existing tokens (`background`, `input`, `accent`, `ring`, `foreground`). It can
land as soon as the `Button` atom is confirmed stable.

**Step 1 — Create `packages/ui/src/components/google-button.tsx`**

- Define `GoogleMark` as a named export (the path SVG, `h-4 w-4 shrink-0 aria-hidden`).
- Define `OAuthButtonProps` interface with `onClick`, `label` (default `"Continue with Google"`), `disabled` (default `false`), `className?`.
- Implement `OAuthButton`: `<Button type="button" variant="outline" onClick={onClick} disabled={disabled} className={cn("gap-2", className)}><GoogleMark />{label}</Button>`.
- Add the new file to `packages/ui` exports (check `package.json` / barrel — mirror how `button.tsx` is exported: `"./components/google-button": "./src/components/google-button.tsx"`).

Acceptance: `pnpm --filter @camp404/ui build` exits 0; TypeScript resolves the export from `apps/web`.

**Step 2 — Update `apps/web/app/auth/sign-in-form.tsx`**

- Import `OAuthButton` from `@camp404/ui/components/google-button`.
- Replace the `<Button type="button" variant="outline" ...>…</Button>` block (lines 160–169) + the file-local `GoogleMark` function (lines 174–188) with `<OAuthButton onClick={handleGoogle} disabled={loading} />`.
- Remove the now-unused `GoogleMark` function.

Acceptance: visual parity with current form; `disabled={loading}` still disables during auth flow.

**Step 3 — Update `apps/web/app/auth/sign-up-form.tsx`**

- Same replacement as Step 2 for the verbatim-duplicate in `sign-up-form.tsx` (lines 153–162 button, lines 177–191 `GoogleMark`).

Acceptance: visual parity; no `GoogleMark` function remains in either auth form file.

**Step 4 — Update `apps/web/app/mcp/connect/page.tsx`**

- Import `OAuthButton`.
- Replace the bespoke `<button>` element (lines 62–69) with `<OAuthButton onClick={onGoogle} label="Sign in with Google" />`.
- Remove the hand-coded `className` with off-token verbose classes (`rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 py-2 text-sm font-medium`).

Acceptance: MCP bridge page renders the Google button with correct outline style; error `<p>` below it is unchanged (it is the host `Alert`, not part of the molecule).

**Step 5 — Add Storybook story file**

- Add `packages/ui/src/components/google-button.stories.tsx` with the four stories defined above (`Default`, `SignIn`, `Disabled`, `FullWidth`).

Acceptance: Storybook renders all four stories without console errors; `Disabled` story shows opacity reduction.

**Step 6 — Add vitest / RTL tests**

- Add `packages/ui/src/components/google-button.test.tsx` (or `.spec.tsx`) with the test cases listed above.

Acceptance: `pnpm --filter @camp404/ui test` exits 0; all 11 `OAuthButton` + 3 `GoogleMark` test cases pass; axe-core (if wired in the test harness) reports no violations.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | File | Usage | Notes |
|---|---|---|---|
| `SignInForm` | `apps/web/app/auth/sign-in-form.tsx` | Primary consumer (sign-in OAuth path) | Replaces current hand-rolled block |
| `SignUpForm` | `apps/web/app/auth/sign-up-form.tsx` | Primary consumer (sign-up OAuth path) | Replaces verbatim-duplicate block |
| `MCPConnectInner` | `apps/web/app/mcp/connect/page.tsx` | MCP bridge OAuth trigger | Replaces bespoke `<button>` element |

The component-library entry (`design/spec/component-library.md §OAuthButton`) lists
consumers as "auth (sign-in + sign-up), MCP bridge" — exactly the three files above.

`SignInForm` and `SignUpForm` are themselves composed into `AuthShell` organism
(`apps/web/components/auth-shell.tsx` — kept app-local per the spec). `MCPConnectInner`
is the app-local bridge page. No other organism or surface is a direct consumer of
`OAuthButton` in this redesign.
