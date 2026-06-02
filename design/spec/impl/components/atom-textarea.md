# Textarea — atom plan

- **mapsTo:** REUSE `packages/ui/src/components/textarea.tsx`
- **Target file:** `packages/ui/src/components/textarea.tsx`

---

## Current state — does it exist? where? gap vs spec

The component exists at `packages/ui/src/components/textarea.tsx` (23 lines). It is a
thin `React.forwardRef` wrapper over a native `<textarea>` that applies a fixed
`min-h-[80px]` and standard shadcn/ui token classes. All five `apps/web` consumers already
import from `@camp404/ui/components/textarea` — no hand-rolled duplicate exists.

### Gaps vs spec (grounded in source files)

| Gap | Source evidence |
|---|---|
| No `variant` prop — the `fullScreen` layout class (`min-h-[40dvh] flex-1 resize-none`) is applied ad-hoc by each consumer via `className` | `apps/web/components/questionnaire/question.tsx` line 453–455; `design/spec/surfaces/20-field-renderer.md` §B5 |
| `bg-background` in the current classes is correct for the base input surface but the boards draw the textarea fill as `$muted` (same as Input), not `$background` | `design/spec/surfaces/04-onboarding-wizard.md` line 63: `fill:$muted stroke:$border`; boards 33 primitive-kit InputField uses `$muted` fill |
| `rounded-md` is a hardcoded Tailwind utility; spec mandates replacement with the `--radius` (md = `0.625rem`) radius token | `design/spec/design-tokens.md` §3 reconciliation #28; `packages/ui/src/components/textarea.tsx` line 11 |
| `text-sm` is a raw size utility; canonical body copy is `--text-body` (Inter 14px) | `design/spec/design-tokens.md` §1.1 Body role |
| No `error` state — border does not shift to `$destructive` in-component; consumers manage it externally via `className`; should be explicit via a data-attribute or `aria-invalid` pattern matching the Input pattern | `design/spec/component-library.md` Textarea entry ("States: error") |
| `ring-offset-background` references the offset pattern; dark-only app has no light-mode offset need — should match how `Input` handles focus | `packages/ui/src/components/textarea.tsx` line 11 |

The component is a **REUSE** with targeted token-alignment edits — no structural rewrite.

---

## API — props, variants, sizes, states

### TS prop interface

```ts
import * as React from "react";

export type TextareaVariant = "default" | "fullScreen";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * "default"    — fixed min-height (min-h-[80px]), user-resizable (vertical).
   * "fullScreen" — grows to fill available flex space:
   *                min-h-[40dvh] flex-1 resize-none.
   *                Use when Textarea is the only control on a viewport-height page
   *                (long_text bio/ideas step, fullScreen field-renderer page).
   */
  variant?: TextareaVariant;
}
```

### Props

| Name | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"default" \| "fullScreen"` | `"default"` | Codifies the ad-hoc `className` pattern used by `question.tsx` |
| `rows` | `number` | — (native) | Passed through; consumers set `rows={6}` (bug dialog, announcements, invite note) or `rows={3}` (invite note short) |
| `maxLength` | `number` | — (native) | Passed through; surfaces enforce their own cap |
| `placeholder` | `string` | — (native) | Passed through |
| `disabled` | `boolean` | `false` | Triggers `cursor-not-allowed opacity-50` |
| `aria-invalid` | `"true" \| boolean` | — | When `"true"`, shifts border to `border-destructive`; host (InputField/QuestionField) sets this |
| `className` | `string` | — | Escape hatch; merged via `cn()` |
| All native `textarea` attrs | — | — | Spread via `...props` |

### States

| State | Visual |
|---|---|
| Empty / placeholder | `text-muted-foreground` placeholder |
| Populated | `text-foreground` |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` (ring = `$primary`) |
| Disabled | `cursor-not-allowed opacity-50` |
| Error | `border-destructive` (applied when host sets `aria-invalid="true"`) |

---

## Tokens & type — exact design tokens + type-scale roles

All short-form semantic tokens; no raw hex.

| Property | Token / role |
|---|---|
| Background fill | `bg-muted` (`--color-muted`; boards draw textarea fill = `$muted`, matching Input; current code uses `bg-background` — fix) |
| Border | `border border-input` (`--color-input` = `--color-border`) |
| Error border | `aria-invalid:border-destructive` (`--color-destructive`) |
| Placeholder text | `placeholder:text-muted-foreground` (`--color-muted-foreground`) |
| Input text | `text-foreground` (`--color-foreground`) |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring` (`--color-ring` = `$primary`) |
| Disabled opacity | `disabled:opacity-50` |
| Border radius | `rounded-[--radius]` → `--radius` (0.625rem / 10px); replaces hardcoded `rounded-md` |
| Type scale | `--text-body` (Inter 14px / 400 / lh 1.45) — replace `text-sm` with `text-[length:--text-body]` or wait for P1-6 `@theme` `--text-*` tokens to land and use `text-body` utility |
| Minimum height (default) | `min-h-[80px]` (inline; no token — bespoke geometry analogous to `r:3` on progress track) |
| Full-screen height | `min-h-[40dvh]` (inline; surface-driven viewport unit) |

> **`whitespace-pre-wrap` is NOT a Textarea class.** It is applied by the host to the
> read-only display `<p>` that renders saved content (e.g. `announcements-manager.tsx`
> lines 287, 341; `design/spec/surfaces/15-announcements.md` §M1b). The Textarea itself
> never applies `whitespace-pre-wrap`; native textarea wraps correctly during input.

---

## Composition & deps — atoms/primitives + @camp404/core helpers

| Dep | Why |
|---|---|
| `cn` from `../lib/utils` | Merges variant classes with consumer `className` override |
| `React.forwardRef` | Required for ref forwarding to the native element (form libs, focus management) |
| No `@camp404/core` helpers | Textarea is a pure presentational primitive with no domain logic |

The `fullScreen` variant class set (`min-h-[40dvh] flex-1 resize-none`) is applied inside the
component via the `variant` prop so consumers stop duplicating it in `className`. No new
dependencies are introduced.

---

## Absorbs — candidates replaced by this component

The component-library merge map contains **no explicit Textarea merge candidates** — no
inventory candidate collapsed into it. The `NoteField` reference in
`component-library.md` (InviteForm entry) is the invite note slot, not a separate
component; it uses `Textarea` directly. There is no hand-rolled textarea elsewhere in
`apps/web`.

The `fullScreen` variant absorbs the inline className pattern from:
- `apps/web/components/questionnaire/question.tsx` line 453–455 (ad-hoc `min-h-[40dvh] flex-1 resize-none`)

Once the `variant` prop ships, consumers remove that ad-hoc `className` injection.

---

## Stories & tests

### Storybook stories (`packages/ui/src/stories/Textarea.stories.tsx`)

| Story | Covers |
|---|---|
| `Default` | No props; shows placeholder; default `rows` (browser default ~2); bg = `$muted` |
| `WithRows` | `rows={6}` — matches bug-dialog / announcements usage |
| `Populated` | Pre-filled `value`; confirms `text-foreground` render |
| `FullScreen` | `variant="fullScreen"` inside a flex column of `min-h-[60dvh]`; confirms grow behaviour |
| `Disabled` | `disabled={true}`; confirms `cursor-not-allowed opacity-50` |
| `ErrorState` | `aria-invalid="true"`; confirms `border-destructive` |
| `MaxLength` | `maxLength={200}` with `rows={4}`; confirms native browser `maxLength` enforcement |
| `WithPlaceholder` | `placeholder="Tell us about yourself…"` — confirms muted placeholder colour |

### Vitest / RTL test cases

```text
describe("Textarea", () => {
  it("renders a <textarea> element")
  it("forwards ref to the underlying textarea")
  it("applies default variant classes (min-h-[80px], bg-muted, border-input)")
  it("applies fullScreen variant classes (min-h-[40dvh] flex-1 resize-none)")
  it("does NOT apply resize-none on default variant")
  it("shows placeholder text via native attr")
  it("applies disabled styles: cursor-not-allowed + opacity-50")
  it("applies border-destructive when aria-invalid='true'")
  it("merges custom className without clobbering base classes")
  it("spreads native textarea attrs (rows, maxLength, name, id)")
  it("calls onChange with the event when user types")
})
```

### a11y notes

- The element is a native `<textarea>` — fully keyboard/screen-reader accessible without
  ARIA additions.
- Always pair with a `<Label htmlFor>` in the host (InputField or QuestionField shell); the
  atom itself does not render a label.
- `aria-invalid="true"` is the standard pattern for error state; set by the host form shell
  (QuestionField / InputField), not by Textarea internally.
- `aria-describedby` for helper / error text is the host's responsibility.
- `disabled` attribute is the correct mechanism for the disabled state — do not use
  `aria-disabled` on native form controls.

---

## Build steps — ordered + acceptance criteria

**Pre-condition:** `design/spec/impl/foundations-tokens.md` radius-token pass lands first so
`rounded-[--radius]` resolves (alternatively replace with the literal `rounded-[0.625rem]`
until tokens land).

1. **Align `bg-muted`**
   Replace `bg-background` with `bg-muted` in the base class string.
   _AC: Textarea background matches `$muted` fill shown on boards 04-onboarding step 03/04._

2. **Align border-radius token**
   Replace `rounded-md` with `rounded-[--radius]` (or `rounded-[0.625rem]`).
   _AC: No hardcoded `rounded-md` on the element; radius resolves to 10px._

3. **Align type scale**
   Replace `text-sm` with `text-[14px]` (interim until P1-6 `--text-body` utility lands).
   _AC: Textarea renders at Inter 14px, matching `--text-body`._

4. **Add `variant` prop + `fullScreen` class set**
   Add `TextareaVariant` type and `variant?: TextareaVariant` to props; compute variant classes
   inside the component using `cn()`.
   _AC: `variant="fullScreen"` applies `min-h-[40dvh] flex-1 resize-none`; default applies nothing extra. `question.tsx` ad-hoc className for fullScreen is removed._

5. **Error state via `aria-invalid`**
   Add `aria-invalid:border-destructive` to the class string so hosts driving `aria-invalid="true"`
   get a visible destructive border without needing a custom `className`.
   _AC: `aria-invalid="true"` on the Textarea renders `border-destructive`; no raw `className` injection required in consumers._

6. **Remove `ring-offset-background` / clean up focus classes**
   The dark-only app has no need for `ring-offset-background`. Simplify focus to
   `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` (matching the Input
   atom's pattern).
   _AC: Focus ring is `$primary` coloured; no ring-offset artefact on dark background._

7. **Update consumers to drop ad-hoc fullScreen className**
   In `apps/web/components/questionnaire/question.tsx`, replace the ad-hoc
   `className={fullScreen ? "min-h-[40dvh] flex-1 resize-none" : undefined}` with
   `variant={fullScreen ? "fullScreen" : "default"}`.
   _AC: No `min-h-[40dvh]` or `resize-none` in consumer `className` props._

8. **Write Storybook stories + Vitest tests**
   _AC: All stories render without console errors; all test cases pass; axe-core a11y check in
   Storybook passes on Default, ErrorState, Disabled stories._

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | Location | Usage |
|---|---|---|
| `LongTextField` | `apps/web/components/questionnaire/question.tsx` | `long_text` body in onboarding wizard + questionnaire runner + my-forms replay; `fullScreen` variant on bio/ideas pages |
| `ReportBugDialog` | `apps/web/components/feedback/report-bug-dialog.tsx` | Bug/feature description field; `rows={6}`, `maxLength` |
| `AnnouncementsManager` | `apps/web/app/captains/announcements/announcements-manager.tsx` | Announcement message body; `rows={6}`, `maxLength={5000}` |
| `InviteForm` | `apps/web/app/tools/invite/invite-form.tsx` | Invitee note field; `rows={3}` |
| `LongTextField` organism | `apps/web/components/questionnaire/question.tsx` (steps 09, 11) | Plain textarea for `other_burns` + dietary `notes` (no DictatePill on these; `design/spec/surfaces/04-onboarding-wizard.md` line 69) |

Downstream molecule/organism consumers that compose `LongTextField` (which wraps Textarea):
- `QuestionField` organism
- `QuestionnaireWizard` organism (via QuestionField)
- `AnnouncementsManager` organism (direct, message body)
- `InviteForm` organism (direct, note field)
- `ReportBugDialog` organism (direct, description field)
