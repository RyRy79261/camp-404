# Divider — atom plan

- **mapsTo:** NEW (no existing file anywhere) · Target file: `packages/ui/src/components/divider.tsx`

---

## Current state — does it exist? where? gap vs spec

**Does not exist** as a named component anywhere in the codebase.

The `packages/ui/src/components/` directory contains no `divider.tsx` or `separator.tsx` file. No Radix `Separator` primitive is installed or imported anywhere in `packages/ui`.

The labelled (`or-divider`) variant is hand-rolled inline **twice** in `apps/web`:

- `apps/web/app/auth/sign-in-form.tsx` lines 150–158: `<div className="relative text-center text-sm">` wrapping an `aria-hidden` `border-t` rule + a `<span>` with off-token colour classes `border-[color:var(--color-border)]` and `bg-[color:var(--color-card)] text-[color:var(--color-muted-foreground)]`.
- `apps/web/app/auth/sign-up-form.tsx` lines 143–151: identical duplicate structure, same off-token verbose class pattern.

The plain (unlabelled) variant is not yet wired at all — it is referenced by:
- `design/spec/surfaces/06-home.md` §M4: "1px `$border` horizontal rule between the rank groups and … EnablePush."
- `design/spec/surfaces/27-questionnaire-complete.md` §Divider: "1px horizontal rule, `fill: $border`, `width: fill`."
- `design/spec/surfaces/16-captain-tools.md` line 60: "A 1px `$border` horizontal divider" (locked-view separator before CaptainLock).
- `design/spec/surfaces/02-auth.md` lines 41, 57: "Two `$border` lines flanking 'Or continue with'" — the labelled variant.

**Gap vs spec:** both inline auth occurrences use verbose off-token colour syntax (`border-[color:var(--color-border)]`, `bg-[color:var(--color-card)]`, `text-[color:var(--color-muted-foreground)]`) instead of the short Tailwind token form required by `design-tokens.md` §4 reconciliation #22. The component-library spec requires a NEW named atom to replace both inlines. Neither the plain rule nor the labelled rule has ever been extracted.

---

## API — props, variants, sizes, states

### TS prop interface sketch

```ts
export interface DividerProps {
  /** Axis of the rule. Default: "horizontal". */
  orientation?: "horizontal" | "vertical";
  /** Optional centre label (enables the labelled / or-divider variant).
   *  When provided, the rule splits into two flanking lines. */
  label?: string;
  /** Extra classes forwarded to the root element. */
  className?: string;
}
```

### Variants

| Variant | Trigger | Description |
|---|---|---|
| `plain` | `label` absent | Full-width 1px `$border` `<hr>`. |
| `labelled` | `label` present | Two `$border` flanking lines with a centred text label. The or-divider pattern used in auth. |

### Orientation

| Value | Rendered as | When used |
|---|---|---|
| `horizontal` (default) | `<hr>` or flex row with two rules | All confirmed consumers. |
| `vertical` | `<div>` with `border-l` + `h-full` | Available in the API for future use; no surface consumer is confirmed yet. |

### Sizes / weight

The rule is always 1px (`border-t` / `border-l`). No thickness variant is needed; the spec calls only "1px `$border` rule" in every surface mention.

### States

Static only. No interactive, disabled, or loading states — the spec entry confirms `States: static`.

---

## Tokens & type — exact design tokens used

All values sourced from `design/spec/design-tokens.md` §2.1 and `packages/ui/src/styles/globals.css`.

| Role | Token | Usage |
|---|---|---|
| Rule colour | `border-border` (`--color-border`) | The 1px horizontal/vertical line in both variants. |
| Label text colour | `text-muted-foreground` (`--color-muted-foreground`) | The centred label text in the labelled variant (spec: `$muted-foreground`). |
| Label background | `bg-card` (`--color-card`) | The label span background — must match the card surface the labelled divider sits on (auth forms are inside `CardContent`). Passed via `className` override when the divider sits on a non-card surface (e.g. `bg-background` on home). |

**Type scale:** the label uses `--text-caption` — Inter / 11px / normal / `$muted-foreground`. This matches the surface spec (`[Inter/11px/normal/$muted-foreground]` in `02-auth.md` line 41) and the `micro/pill` role (10–11px / 600–700). The spec explicitly draws `11px/normal` for this label, so it sits at the low end of `--text-micro`; use `text-[11px]` until `--text-micro` is tokenised per `design-tokens.md` §1.3 font-wiring follow-up.

No mono face, no status tokens, no radius tokens are used by this atom.

---

## Composition & deps — atoms/primitives + helpers

- **`cn`** from `packages/ui/src/lib/utils.ts` — class-merging utility, used by all `@camp404/ui` components.
- No Radix primitive required. The component is a thin HTML wrapper (`<hr>` + optional `<span>`) with no interaction — Radix `Separator` would add a dependency for zero gain over a native `<hr role="separator">`.
- No `@camp404/core` helper needed (no logic, no data).
- No child atoms. The Divider is a leaf.

---

## Absorbs — candidates it replaces from the merge map

The merge map in `design/spec/component-library.md` does not list a dedicated Divider merge entry (the merge map covers Badge, NavCard, Alert, IconBadge, SegmentedControl, OptionCardGroup, CodeDisplay, EmptyState). The Divider is NEW — it absorbs no other canonical component.

It does **replace** the two duplicated inline or-divider patterns:

| File | Lines | Pattern replaced |
|---|---|---|
| `apps/web/app/auth/sign-in-form.tsx` | 150–158 | `<div className="relative text-center text-sm">` inline block |
| `apps/web/app/auth/sign-up-form.tsx` | 143–151 | Identical duplicate |

After the atom ships, both inlines become `<Divider label="Or continue with" />`. The `SignInForm`/`SignUpForm` organisms in `component-library.md` explicitly list Divider as a composition dependency.

---

## Stories & tests

### Storybook stories

| Story | Props | What it shows |
|---|---|---|
| `Plain/Horizontal` | `orientation="horizontal"` | Default 1px border rule spanning full width. |
| `Plain/Vertical` | `orientation="vertical"` | 1px vertical rule; shown in a fixed-height flex container. |
| `Labelled/OrContinueWith` | `label="Or continue with"` | The auth or-divider; label centred between two flanking rules. On `bg-card` background to show correct label bleed. |
| `Labelled/OnBackground` | `label="Or continue with"` + `className="[&_span]:bg-background"` | Same labelled variant on `bg-background` surface (home page context). Demonstrates the background-override pattern. |
| `Labelled/CustomLabel` | `label="Or"` | Short label variant — verifies centering holds. |

All stories rendered against the dark theme (`$background` canvas). Each story has a **"Tokens" doc table** listing the two tokens in use.

### Vitest / RTL test cases

| Test | Assertion |
|---|---|
| Renders an `<hr>` with `role="separator"` when no label | `getByRole("separator")` present; no `<span>` in DOM. |
| Applies `aria-orientation="vertical"` when `orientation="vertical"` | ARIA attribute set correctly. |
| Labelled variant renders label text | `getByText("Or continue with")` present. |
| Labelled variant renders `aria-hidden` on the flanking rule divs | Flanking lines have `aria-hidden="true"` — they are decorative. |
| `className` prop is forwarded to root element | Custom class appears on the wrapper. |
| Snapshot — plain horizontal | Stable HTML snapshot. |
| Snapshot — labelled | Stable HTML snapshot. |

### A11y notes

- **Plain variant:** render as `<hr>` — native `role="separator"` with implicit `aria-orientation="horizontal"`. For `orientation="vertical"` set `aria-orientation="vertical"` explicitly (the `<hr>` element defaults to horizontal).
- **Labelled variant:** the flanking rule lines are purely decorative — mark both `aria-hidden="true"`. The label `<span>` is plain text inside the wrapping element; no `role` override needed. The entire labelled wrapper has no interactive role — it is read as inline text between the two visually hidden rules. Confirm with axe-core in Storybook a11y addon.
- **Dark-only app:** no `dark:` variants are needed (per `component-library.md` conventions).
- **Reduced motion:** no animation; no motion concern.

---

## Build steps — ordered with acceptance criteria

1. **Create `packages/ui/src/components/divider.tsx`**
   - Export `Divider` as a named export (no default export, consistent with the package convention).
   - Implement plain `<hr>` for `orientation="horizontal"` with `border-border` and `w-full`.
   - Implement labelled variant: flex row with `flex-1 border-t border-border` lines flanking a `<span>` (`px-2 text-[11px] text-muted-foreground`) — no raw hex, no verbose `border-[color:var(--color-border)]`.
   - Use `cn()` for class merging.
   - Forward `className` to the root element.
   - Acceptance: file renders in isolation with correct token classes; no raw hex or verbose off-token syntax in source.

2. **Export from `packages/ui/src/index.ts`** (or the package's barrel export)
   - Add `export { Divider } from "./components/divider"`.
   - Acceptance: `import { Divider } from "@camp404/ui"` resolves.

3. **Add `packages/ui/src/components/divider.stories.tsx`**
   - The five stories listed above; all render against dark canvas.
   - Acceptance: Storybook builds without error; axe-core a11y addon passes all stories.

4. **Add `packages/ui/src/components/__tests__/divider.test.tsx`** (or co-located `divider.test.tsx`)
   - The seven vitest/RTL cases above.
   - Acceptance: `pnpm test --filter @camp404/ui` passes green.

5. **Replace inline or-dividers in `apps/web/app/auth/sign-in-form.tsx`**
   - Delete lines 150–158; insert `<Divider label="Or continue with" />`.
   - Acceptance: visual parity confirmed; no off-token colour class remains in either auth form for this pattern.

6. **Replace inline or-dividers in `apps/web/app/auth/sign-up-form.tsx`**
   - Delete lines 143–151; insert `<Divider label="Or continue with" />`.
   - Acceptance: same as step 5.

7. **Wire `Divider` into home page** (`apps/web/app/page.tsx` or its `RankGroupCard` parent)
   - Insert `<Divider />` (plain, horizontal) between the rank-group card stack and the `EnablePush` button, per `06-home.md` §M4.
   - Acceptance: Divider renders at `$border` colour between groups and push CTA; does not render when EnablePush is null.

8. **Wire `Divider` into captain-tools locked view** (`apps/web/app/captains/tools/page.tsx`)
   - Insert `<Divider />` between the Intro block and the `CaptainLock` panel, per `16-captain-tools.md` line 60.
   - Acceptance: 1px `$border` rule appears in the non-captain locked view; no annotation label is rendered (it is a design-only annotation per the surface spec).

9. **Wire `Divider` into completion-queue** (`apps/web/app/…` completion-queue surface, S27)
   - Insert `<Divider />` between Section A (CompletionHero) and Section B (required queue), per `27-questionnaire-complete.md` §Divider.
   - Acceptance: full-width 1px rule appears between sections.

**Note on background-bleed for the labelled variant:** the `<span>` background must match the surface it sits on. On auth (`CardContent`) it is `bg-card`; on home (`$background`) it is `bg-background`. The default should be `bg-card` (where the only confirmed labelled consumer lives). For home or other non-card contexts the caller passes `className` with a span-targeting override (e.g. `[&_span]:bg-background`) — document this in the stories and component JSDoc.

---

## Consumers — which molecules / organisms / surfaces use it

| Consumer | File (target) | Variant | Notes |
|---|---|---|---|
| `SignInForm` | `apps/web/app/auth/sign-in-form.tsx` | labelled (`"Or continue with"`) | Replaces lines 150–158; on `bg-card` surface. |
| `SignUpForm` | `apps/web/app/auth/sign-up-form.tsx` | labelled (`"Or continue with"`) | Replaces lines 143–151; identical context. |
| Home page (between rank groups + EnablePush) | `apps/web/app/page.tsx` or `RankGroupCard` container | plain horizontal | `06-home.md` §M4. |
| Captain-tools locked view | `apps/web/app/captains/tools/page.tsx` | plain horizontal | Separator before `CaptainLock`; `16-captain-tools.md` line 60. |
| Completion queue (S27) | completion-queue surface | plain horizontal | Between Section A and Section B; `27-questionnaire-complete.md` §Divider. |

The component-library entry also lists `profile-edit` as a consumer ("home (groups/push), profile-edit, captain-tools (locked separator), completion-queue, auth or-divider host"). The `design/spec/surfaces/08-profile-edit.md` does not explicitly name a Divider placement; the build step for that surface should confirm whether a plain rule is needed before wiring it.
