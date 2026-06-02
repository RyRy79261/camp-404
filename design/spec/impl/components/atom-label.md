# Label — atom plan

- **mapsTo:** REUSE `packages/ui/src/components/label.tsx`
- **Target file:** `packages/ui/src/components/label.tsx`

---

## Current state — does it exist? where? gap vs spec

**Exists at:** `packages/ui/src/components/label.tsx`

The component is a thin Radix `@radix-ui/react-label` wrapper with CVA. It is
already imported — not hand-rolled — across every form surface in `apps/web`:

| Consumer file | Uses |
|---|---|
| `apps/web/app/auth/sign-in-form.tsx` | `<Label htmlFor="...">` plain labels |
| `apps/web/app/auth/sign-up-form.tsx` | `<Label htmlFor="...">` plain labels |
| `apps/web/app/profile/edit/edit-form.tsx` | `<Label htmlFor="displayName">` |
| `apps/web/app/profile/edit/delete-account.tsx` | `<Label htmlFor="confirm">` |
| `apps/web/app/signup/required/invite-gate-form.tsx` | `<Label htmlFor="invite-code">` |
| `apps/web/app/tools/invite/invite-form.tsx` | multiple field labels |
| `apps/web/app/captains/announcements/announcements-manager.tsx` | title/body/presentation labels |
| `apps/web/components/questionnaire/question.tsx` | question prompt label + checkbox option labels |
| `apps/web/components/feedback/report-bug-dialog.tsx` | description + AI-toggle labels |

No hand-rolled `<label>` version exists in `apps/web` — every consumer imports
from `@camp404/ui/components/label`. No PROMOTE action is needed.

**Gaps vs spec (verified against source):**

1. **Token drift — `text-sm` is Tailwind's 14px/500 shorthand, but the spec
   assigns `--text-label` = Inter 13px/600–700.** The current CVA string
   `"text-sm font-medium leading-none"` renders at 14px/500; the design-tokens
   spec (§1.1 table, `--text-label`) calls for 13px and weight 600–700.
   Reference: `design/spec/design-tokens.md` §1.1 "Label" row.

2. **`leading-none` vs lh 1.4.** The spec assigns `lh 1.4` to the Label role;
   `leading-none` (lh 1) truncates multi-word prompts incorrectly on wrap.

3. **`peer-disabled` coupling.** The dimmed state is implemented via
   `peer-disabled:cursor-not-allowed peer-disabled:opacity-70`, which requires
   the sibling Input to carry the `peer` class. The spec describes a simple
   `disabled`/`dimmed` prop-driven state — this peer approach is fine for
   InputField composition but the atom itself has no `disabled` prop today.

4. **Required `*` marker lives in consumers, not the atom.** `question.tsx`
   line 63 appends `<span className="ml-1 text-[color:var(--color-primary)]">*</span>`
   inline. The component-library spec (`## Label`, `Variants: with-required-marker`)
   and the design-tokens reconciliation note §4 item 29 both say: the marker
   should be `$primary` (confirmed by live code), not `$destructive` (the boards
   draw it as `$destructive`). The atom should own this via a `required` prop so
   the span is never duplicated across consumers.

5. **`font-medium` (500) vs spec 600–700.** Minor but tracked under gap 1.

6. **No `disabled` prop.** Adding an explicit `disabled` boolean prop lets the
   host pass it without needing the `peer` coupling, matching the spec's "dimmed
   (field disabled)" state description.

---

## API — props, variants, sizes, states

### Props interface (TypeScript sketch)

```ts
import * as LabelPrimitive from "@radix-ui/react-label";
import { type VariantProps } from "class-variance-authority";

interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {
  /**
   * When true, appends a primary-coloured `*` span after the label text.
   * The marker is `$primary` (design-tokens §4 item 29; per live code in
   * question.tsx; NOT `$destructive` as drawn on S05 boards).
   */
  required?: boolean;
  /**
   * When true, applies reduced-opacity dimmed treatment.
   * Supplements the peer-disabled CSS coupling; host can pass this prop
   * directly when no peer relationship exists (e.g. select, combobox).
   */
  disabled?: boolean;
}
```

### Variants

| Variant | Class delta | Used for |
|---|---|---|
| `default` | `text-[13px] font-semibold leading-[1.4] text-foreground` | All standard field labels |
| `option` | `text-sm font-normal leading-[1.4] text-foreground` | Inline checkbox/radio option labels (question.tsx line 166: `className="text-sm font-normal"`) |

### States

| State | Visual treatment |
|---|---|
| `default` | `text-foreground` |
| `dimmed` (field disabled) | `opacity-70 cursor-not-allowed` — via `peer-disabled:` CSS coupling OR explicit `disabled` prop |
| `with-required-marker` | `required` prop → appends `<span aria-hidden="true" className="ml-1 text-primary">*</span>` |

---

## Tokens & type — exact design tokens + type-scale roles

All values sourced from `design/spec/design-tokens.md`.

| Property | Token / role | Resolved value |
|---|---|---|
| Font family | `font-sans` → `--font-sans` (Inter, after §1.3 wiring) | Inter |
| Font size | `--text-label` role: **13px** | `text-[13px]` (or `text-xs` + snap once `--text-label` is registered as a Tailwind token) |
| Font weight | `--text-label` role: 600–700 | `font-semibold` (600) |
| Line height | `--text-label` role: lh 1.4 | `leading-[1.4]` |
| Text colour | `$foreground` | `text-foreground` |
| Required marker colour | `$primary` (design-tokens §4 item 29 + live code) | `text-primary` |
| Disabled opacity | no dedicated token — use `opacity-70` (matches current peer-disabled value) | `opacity-70` |

**No raw hex, no `text-[color:var(--color-primary)]` verbose form** — use the
short Tailwind token form `text-primary` (design-tokens §4 item 22, reconciliation
for the ~93 verbose usages; `@camp404/ui` already uses short form).

The `--text-label` step is not yet a registered Tailwind `@theme` token (confirmed:
`packages/ui/src/styles/globals.css` has no `--text-*` entries). Until
`foundations-tokens.md` is implemented, use inline `text-[13px]`. Once the token
is registered, migrate to `text-label`.

---

## Composition & deps

| Dependency | Role |
|---|---|
| `@radix-ui/react-label` | Accessible `<label>` primitive with `htmlFor` association; handles `for`/`id` pairing and click-forwarding |
| `class-variance-authority` (`cva`) | Variant class management |
| `cn` (`packages/ui/src/lib/utils`) | `clsx` + `tailwind-merge` className combiner |

No `@camp404/core` helpers are needed — Label is purely presentational with no
domain logic (no `rankLevel`, no validation).

---

## Absorbs

The merge map in `component-library.md` lists no explicit candidates absorbed into
Label. Label itself is listed in the merge-map preamble as a reused atom; no other
candidate collapses into it.

However, the inline required-marker span pattern is duplicated across consumers:

| File | Duplicated pattern |
|---|---|
| `apps/web/components/questionnaire/question.tsx:63` | `<span className="ml-1 text-[color:var(--color-primary)]">*</span>` |

Adding `required` prop to the atom removes this inline duplication. No full
component is being absorbed — this is a consolidation of an inline pattern.

The `option` variant absorbs the `className="text-sm font-normal"` override applied
at `question.tsx:166` so consumers stop overriding the atom's base style.

---

## Stories & tests

### Storybook stories

```text
Label/Default            — <Label htmlFor="demo">Email address</Label>
Label/WithRequired       — required={true}; confirm * renders with text-primary colour
Label/Dimmed             — disabled={true}; confirm opacity-70
Label/OptionVariant      — variant="option"; font-normal + text-sm (checkbox/radio pairing)
Label/LongPrompt         — multi-line question prompt ("Tell us a bit about yourself
                           and why you want to come to camp."); confirm lh 1.4 wraps cleanly
Label/InInputField       — composed inside InputField stencil (Label + Input with peer); confirm peer-disabled propagates
```

### Vitest / RTL test cases

```text
✓ renders children as label text
✓ passes htmlFor to the underlying <label> element
✓ required=true renders a <span aria-hidden> containing "*"
✓ required=true — the * span has computed colour resolving to primary (smoke: class includes text-primary)
✓ required=false (default) — no * span present
✓ disabled=true — element has opacity-70 class
✓ variant="option" — element has font-normal class
✓ accepts and forwards arbitrary className
✓ forwards ref to the underlying DOM element
✓ clicking label moves focus to associated Input (htmlFor round-trip)
```

### Accessibility notes

- The `*` required marker span carries `aria-hidden="true"` — screen readers
  announce required state from the sibling input's `required` attribute or
  `aria-required`, not from a visual asterisk.
- Radix `LabelPrimitive.Root` already emits `<label>` with correct `for`
  attribute; no additional ARIA needed on the atom itself.
- `peer-disabled` CSS coupling works only when Label and Input share a `peer`
  class relationship in the markup. The new `disabled` prop removes this coupling
  requirement for non-Input controls (Select, Combobox, Slider).

---

## Build steps

**Prerequisites:** `foundations-tokens.md` font-wiring step (§1.3) is NOT
required to ship Label. The `text-[13px]` inline value works today. The migration
to `text-label` utility is a deferred codemod once the token is registered.

1. **Update CVA base classes.**
   Change `"text-sm font-medium leading-none ..."` to
   `"text-[13px] font-semibold leading-[1.4] text-foreground ..."`.
   Acceptance: Storybook Default story renders at 13px/semibold/lh-1.4.

2. **Add `required` prop + marker span.**
   When `required={true}`, render `<span aria-hidden="true" className="ml-1 text-primary">*</span>`
   after `{children}`. Default `required={false}`.
   Acceptance: WithRequired story shows `*` in primary colour; RTL confirms span
   present/absent.

3. **Add `disabled` prop.**
   When `disabled={true}`, add `opacity-70 cursor-not-allowed` classes.
   Keep existing `peer-disabled:cursor-not-allowed peer-disabled:opacity-70`
   for backwards compatibility with InputField's peer pattern.
   Acceptance: Dimmed story shows reduced opacity.

4. **Add `option` variant.**
   CVA `variants.variant.option = "text-sm font-normal"` (14px/normal — checkbox
   option labels per spec §1.1 "Body" row and live usage at `question.tsx:166`).
   Acceptance: OptionVariant story renders at 14px/normal.

5. **Update TypeScript types.**
   Export the `LabelProps` interface. Remove the now-redundant bare
   `VariantProps<typeof labelVariants>` inline spread and replace with the
   explicit interface.
   Acceptance: TypeScript `tsc --noEmit` passes.

6. **Migrate consumer inline markers.**
   In `apps/web/components/questionnaire/question.tsx`, replace the inline
   `<span className="ml-1 text-[color:var(--color-primary)]">*</span>` and
   inline `variant="option"` className with the new props:
   - Line 60–65: `<Label htmlFor={fieldId} required={"required" in question && question.required}>…</Label>` (no inner span)
   - Line 166: `<Label htmlFor={checkboxId} variant="option">…</Label>` (no className override)
   Acceptance: question.tsx compiles; wizard RTL tests pass; visual parity
   confirmed.

7. **Token long-form → short-form migration (token reconciliation codemod).**
   Any remaining `text-[color:var(--color-foreground)]` or
   `text-[color:var(--color-primary)]` verbose usages in Label consumers should
   use `text-foreground` / `text-primary`. This aligns with design-tokens §4
   item 22. Out of scope for this atom's build step; tracked in
   `foundations-tokens.md`.

8. **Write/update Storybook stories and RTL tests** per the stories and test
   cases section above.
   Acceptance: `pnpm --filter @camp404/ui storybook` shows all 6 stories;
   `pnpm --filter @camp404/ui test` passes all 10 cases.

---

## Consumers

**Direct consumers (import Label from `@camp404/ui/components/label`):**

| Consumer | Surface | Notes |
|---|---|---|
| `apps/web/app/auth/sign-in-form.tsx` | S02 Auth (sign-in) | email + password labels; no `*` today (required implicit) |
| `apps/web/app/auth/sign-up-form.tsx` | S02 Auth (sign-up) | email + password + confirm labels |
| `apps/web/app/signup/required/invite-gate-form.tsx` | S03 Invite gate | "Invite code" label |
| `apps/web/app/profile/edit/edit-form.tsx` | S08 Profile edit | "Display name" label |
| `apps/web/app/profile/edit/delete-account.tsx` | S08 Profile edit | "Confirmation" label |
| `apps/web/app/tools/invite/invite-form.tsx` | S11 Invite tool | email, note, code, preApprove, maxUses labels |
| `apps/web/app/captains/announcements/announcements-manager.tsx` | S15 Announcements | title, body, presentation labels |
| `apps/web/components/questionnaire/question.tsx` | S20 Field renderer (+ S04 Onboarding, S24 Runner, S12 My forms) | question prompt label (with `*`) + checkbox option labels |
| `apps/web/components/feedback/report-bug-dialog.tsx` | S25 Global overlays (bug dialog) | description + AI-toggle labels |

**Composed-via molecules (indirect consumers):**

| Molecule/organism | How Label is used |
|---|---|
| `InputField` (PROMOTE target `@camp404/ui/input-field.tsx`) | Label + Input pairing; Label carries the `label` prop |
| `QuestionField` (`apps/web/components/questionnaire/question.tsx`) | Label + `required` marker + multi_select checkbox option labels |
| `SignInForm` / `SignUpForm` (app-local) | Direct Label above Input |
| `InviteForm` (app-local) | Direct Label above Input/CodeDisplay/Checkbox |
| `AnnouncementsManager` (app-local) | Direct Label above Input/Textarea/Select |
| `ReportBugDialog` (app-local) | Direct Label above Textarea + Checkbox |
