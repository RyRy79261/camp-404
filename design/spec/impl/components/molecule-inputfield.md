# InputField — molecule plan

- **mapsTo:** PROMOTE `apps/web` (inline per-surface pattern) · Target file: `packages/ui/src/components/input-field.tsx`

---

## Current state — does it exist? where? gap vs spec

No `InputField` component exists in `packages/ui/src/components/` — there is no
`input-field.tsx` file in the package. The atoms that compose it do exist:
`input.tsx` (reuse) and `label.tsx` (reuse).

The molecule-level pairing (Label + Input + optional helper + optional error) is
**hand-rolled inline on every surface that needs it**, always as a `<div>` wrapper
with the same structural pattern. Confirmed usages of the inline pattern:

| File | Pattern | Has error? | Has helper? | Required `*`? |
|---|---|---|---|---|
| `apps/web/app/auth/sign-in-form.tsx` | `<div className="grid gap-2"><Label htmlFor="…"><Input …/></div>` then `<p … text-[color:var(--color-destructive)]>` below form | Yes (form-level, not field-level) | No | No |
| `apps/web/app/auth/sign-up-form.tsx` | same `grid gap-2` pattern | Yes (form-level) | No | No |
| `apps/web/app/signup/required/invite-gate-form.tsx` | same `grid gap-2` pattern + `<p … text-[color:var(--color-destructive)]>` per field | Yes (per field) | No | No |
| `apps/web/app/tools/invite/invite-form.tsx` | `<div className="space-y-2"><Label …><Input …></div>` | Yes (form-level `result.error`) | No | No |
| `apps/web/app/profile/edit/edit-form.tsx` | `<div className="grid gap-2"><Label …><Input …></div>` + `<p … text-[color:var(--color-destructive)]>` | Yes (form-level) | No | No |
| `apps/web/app/captains/announcements/announcements-manager.tsx` | `<div className="space-y-1.5"><Label …><Input …></div>` | Yes (form-level) | No | No |
| `apps/web/components/questionnaire/question.tsx` | `<Label htmlFor={fieldId}>…{required && <span className="ml-1 text-[color:var(--color-primary)]">*</span>}{question.helper && <p className="text-xs text-[color:var(--color-muted-foreground)]">…</p>}` | Yes (`text-xs text-destructive` per field, `role="alert"`) | Yes (`question.helper`) | Yes (`*` in `$primary`, per token spec §4 item 29) |

**Gap vs spec (board 06 + component-library.md):**

1. Board `06-inputfield.txt` draws: vertical `w:360 gap:6` stack — `Label` (Inter/13px/500/$foreground) then `Input` (w:fill h:46 pad:[0,14] r:$radius fill:$muted stroke:$border placeholder=$muted-foreground). The canonical molecule adds `helper` and `error` slots above this base — absent from the board excerpt but present in `component-library.md` spec.
2. The live `Input` atom is `h-10` (40px) with `bg-background` fill; board specifies `h:46 fill:$muted`. Gap: height and background need updating on the Input atom (tracked in `atom-input.md`) — InputField inherits the corrected atom.
3. Gap-spacing: board says `gap:6` (24px Tailwind = `gap-6` would be excessive; board units are likely px, so `gap:6px` = `gap-1.5`). Live wrappers use `gap-2` (8px) or `space-y-1.5` (6px). Snap to `gap-1.5` (6px) matching the board's `gap:6`.
4. Required marker: `question.tsx` correctly uses `text-[color:var(--color-primary)]` — matches design-tokens §4 item 29 (`$primary`, not `$destructive`). Other surfaces lack a required marker. InputField must own the `*` rendering.
5. Helper text: `text-xs text-muted-foreground` (`question.tsx`) — matches `$muted-foreground` spec but uses `text-xs` (12px). Design-tokens caption role is 12px/400–500 — align with `--text-caption`.
6. Error text: `text-xs text-destructive` in `question.tsx`; `text-sm text-[color:var(--color-destructive)]` in auth/profile — inconsistent. Canonicalise to `text-xs` + `text-destructive` (Tailwind short form, per design-tokens P1-5).
7. Error `role="alert"` present in `question.tsx` and `invite-gate-form.tsx` — missing in `edit-form.tsx` and auth forms. InputField must own this.
8. `aria-describedby` wiring between Input and helper/error is absent everywhere. InputField must own this wiring.
9. No `input-field.tsx` exists in `@camp404/ui` — confirmed PROMOTE (build once, kill per-surface reinvention).

---

## API — props, variants, sizes, states

```ts
interface InputFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Visible label text. Required — every field must have a label. */
  label: string;
  /**
   * Stable DOM id shared between the <label>, <input>, and aria-describedby.
   * Required; callers own uniqueness.
   */
  id: string;
  /** Secondary hint rendered below the label, above the input. */
  helper?: string;
  /**
   * Validation error message. When present, the input gains
   * aria-invalid="true" and the message has role="alert".
   * Overrides helper visibility (helper hides when error is set —
   * no double-stacking of sub-lines).
   */
  error?: string;
  /**
   * Renders the required `*` marker after the label.
   * Does NOT replace native `required` — pass both if the form validates natively.
   */
  required?: boolean;
  /** Forwarded to the underlying Input atom. */
  disabled?: boolean;
  /**
   * Optional className applied to the outer wrapper div.
   * The input itself accepts className via the spread.
   */
  wrapperClassName?: string;
}
```

**Variants (implicit, driven by props — no explicit `variant` prop needed):**

| Variant | Trigger |
|---|---|
| `default` | No `helper`, no `error` |
| `with-helper` | `helper` prop set, no `error` |
| `error` | `error` prop set (hides helper) |
| `required` | `required` prop set (appends `*` in `$primary`) |
| `disabled` | `disabled` prop set (opacity on input; label dims via `peer-disabled:opacity-70` from Label atom) |

**Sizes:** single size — board draws a fixed `h:46` input with `gap:6` label-to-input spacing. No size variant needed at the molecule level; the Input atom owns its own `size` if that is ever added.

**States:** `empty` · `populated` · `focus` (ring from Input atom) · `disabled` · `error`.

---

## Tokens & type — exact design tokens + type-scale roles

| Slot | Token | Type role |
|---|---|---|
| Label text | `text-foreground` | `--text-label` (Inter 13px/600–700) |
| Required `*` | `text-primary` | — (marker, not prose) |
| Input background | `bg-muted` | — |
| Input border | `border-input` (= `$border`) | — |
| Input text | `text-foreground` | `--text-body` (Inter 14px/400) |
| Input placeholder | `text-muted-foreground` | `--text-body` (400, muted) |
| Input focus ring | `ring-ring` (= `$primary`) | — |
| Helper text | `text-muted-foreground` | `--text-caption` (Inter 12px/400) |
| Error text | `text-destructive` | `--text-caption` (Inter 12px/400) |
| Gap (label→input) | `gap-1.5` (6px) | — (board `gap:6`) |
| Input height | board `h:46` → `h-[46px]` (until Input atom is canonicalised to `h-[46px]`) | — |
| Input radius | `rounded` (= `--radius` md, 10px) | — (board `r:$radius`) |

**No raw hex anywhere.** `text-[color:var(--color-destructive)]` (currently in `edit-form.tsx`, `sign-in-form.tsx`, `sign-up-form.tsx`, `invite-gate-form.tsx`) → replaced by `text-destructive` (Tailwind short form, design-tokens P1-5).

**Font:** Input and Label are Inter (UI face). No mono usage in InputField itself — `className="font-mono"` applied by callers on the Input when the field holds a slug/code (e.g. invite-form.tsx invite code field).

---

## Composition & deps — atoms + helpers

- **`Input`** — `packages/ui/src/components/input.tsx` (REUSE) — the underlying `<input>` primitive.
- **`Label`** — `packages/ui/src/components/label.tsx` (REUSE) — Radix `@radix-ui/react-label` wrapper with `cva`.
- **`cn`** — `packages/ui/src/lib/utils.ts` — className merger; used on `wrapperClassName` + input `className` spread.
- No `@camp404/core` helpers required for InputField itself. Validation logic (required checks, error message derivation) lives in the caller (server action / Zod schema). InputField only renders what it is handed.
- No `rankLevel` needed — no rank-gating logic inside this molecule.

---

## Absorbs — candidates it replaces (merge map)

The merge map does not list a named merged candidate for InputField — it is not a
collapsed set of distinct components but a **promotion of a repeated inline
pattern**. It replaces the following concrete inline patterns, deleting them when
consumers are migrated:

| Source pattern | Location | Absorbed |
|---|---|---|
| `<div className="grid gap-2"><Label htmlFor="…"/><Input …/></div>` + bare `<p … text-[color:var(--color-destructive)]>` | `sign-in-form.tsx`, `sign-up-form.tsx`, `edit-form.tsx` | Yes — migrate to `<InputField>` |
| `<div className="grid gap-2"><Label …/><Input …/></div>` + per-field `<p … text-destructive>` with `role="alert"` | `invite-gate-form.tsx` | Yes |
| `<div className="space-y-2"><Label …/><Input …/></div>` | `invite-form.tsx` (email field, code field) | Yes |
| `<div className="space-y-1.5"><Label …/><Input …/></div>` | `announcements-manager.tsx` (title field) | Yes |
| `<Label htmlFor={fieldId}>…required `*`…</Label>{helper && <p …>}{error && <p … role="alert">}` + bare `<Input>` | `question.tsx` short_text case within `FieldInput` | Yes — `QuestionField` (the organism) delegates short_text to `<InputField>` |

After migration, the per-surface wrappers listed above are deleted; no duplicate
label+input shell ships.

---

## Stories & tests — Storybook + vitest/RTL; a11y

### Storybook stories (file: `packages/ui/src/components/input-field.stories.tsx`)

| Story | Props | Purpose |
|---|---|---|
| `Default` | `id="email" label="Email" placeholder="you@example.com"` | Base case; no helper, no error |
| `WithHelper` | + `helper="We'll never share your email."` | Helper line rendered |
| `WithError` | + `error="This field is required."` | Error line; helper hidden |
| `Required` | + `required` | Asterisk marker in `$primary` |
| `RequiredWithError` | + `required` + `error="Enter a valid email address."` | Required + error state |
| `Disabled` | + `disabled` | Dimmed input + label |
| `MonoInput` | + `className="font-mono"` + invite-slug placeholder | Mono variant (slug/code face — caller applies `font-mono`) |
| `Populated` | controlled with a value | Populated state |

### vitest / RTL tests (file: `packages/ui/src/components/__tests__/input-field.test.tsx`)

| Test | Assertion |
|---|---|
| renders label with `htmlFor` pointing to input `id` | `getByLabelText("Email")` resolves the input |
| renders helper text when `helper` prop is set | `getByText("We'll never share…")` present |
| hides helper when `error` is also set | helper text absent; error text present |
| error line has `role="alert"` | `getByRole("alert")` returns error node |
| input has `aria-invalid="true"` when `error` is set | `expect(input).toHaveAttribute("aria-invalid", "true")` |
| input has `aria-describedby` pointing to error id | `aria-describedby` includes the error element's id |
| input has `aria-describedby` pointing to helper id when no error | `aria-describedby` includes helper element's id |
| required `*` marker renders when `required` is true | `getByText("*")` present within label region |
| `*` marker has `text-primary` class | class assertion |
| disabled input is not interactive | `userEvent.type` has no effect; `cursor-not-allowed` via atom |
| `wrapperClassName` is applied to outer div | class on wrapper node |
| forwards native input attrs (`type`, `placeholder`, `maxLength`, `autoComplete`) | attribute assertions |
| passes `name` through for form submission | `name` attribute present |

### a11y notes

- `<label>` is always rendered (no label-less usage). `htmlFor` → input `id` is the explicit association — no implicit wrapping.
- Error text: `role="alert"` for live announcement on error appearance; `aria-invalid="true"` on the input.
- Helper text: `aria-describedby` on the input points to the helper `id` when present and no error, or to the error `id` when error is present. Only one descriptor at a time.
- Required `*` is `aria-hidden="true"` (it is a visual cue; the native `required` attribute on the input carries the semantic meaning to assistive technology).
- The Label atom already handles `peer-disabled:opacity-70`; InputField passes `disabled` to both Label (via className context) and Input.
- No autofocus; callers set `autoFocus` if needed via spread.

---

## Build steps — ordered + acceptance criteria

**Prerequisites:** `atom-input.md` plan accepted (Input height corrected to `h-[46px]` and background to `bg-muted`; token-spelling codemod P1-5 applied removing verbose `text-[color:var(--color-*)]` forms).

1. **Create `packages/ui/src/components/input-field.tsx`**
   - Acceptance: file exists; exports named `InputField` and `InputFieldProps`; TypeScript strict with no `any`.

2. **Implement the component body**
   - Derive stable ids: `helperId = id + "-helper"`, `errorId = id + "-error"`.
   - Render stack: outer `<div className={cn("flex flex-col gap-1.5", wrapperClassName)}>` → `<Label htmlFor={id}>` with optional `<span aria-hidden="true" className="ml-1 text-primary">*</span>` when `required` → `<Input id={id} aria-invalid={!!error} aria-describedby={error ? errorId : helper ? helperId : undefined} disabled={disabled} className={inputClassName} {...rest} />` → conditional `<p id={helperId} className="text-xs text-muted-foreground">` (hidden when error) → conditional `<p id={errorId} className="text-xs text-destructive" role="alert">`.
   - Acceptance: all Storybook stories render correctly; no console errors; `aria-describedby` wired.

3. **Add Storybook stories** (`input-field.stories.tsx`)
   - Acceptance: all 8 stories render in isolation without errors; error story shows red text; helper story shows muted text; disabled story shows dimmed state.

4. **Add tests** (`__tests__/input-field.test.tsx`)
   - Acceptance: all 13 test cases pass; `@testing-library/jest-dom` a11y matchers confirm `aria-invalid`, `aria-describedby`, `role="alert"`.

5. **Export from package index**
   - Acceptance: `import { InputField } from "@camp404/ui/components/input-field"` resolves; `InputFieldProps` is also exported.

6. **Migrate consumers** — replace the five inline patterns listed in the Absorbs section with `<InputField>`. Migration order: `sign-in-form.tsx` → `sign-up-form.tsx` → `invite-gate-form.tsx` → `edit-form.tsx` → `invite-form.tsx` → `announcements-manager.tsx` → `question.tsx` (`short_text` case).
   - Acceptance: each migrated file has no remaining `<div className="grid gap-2"><Label` or `<div className="space-y-*"><Label` + bare `<Input` inline pattern; error `<p>` tags that used `text-[color:var(--color-destructive)]` are gone; all tests still pass.

7. **Delete dead inline patterns** — confirm no residual `text-[color:var(--color-destructive)]` on field-level `<p>` tags (form-level banners migrate to the Alert molecule separately).
   - Acceptance: `grep -r "text-\[color:var(--color-destructive)\]" apps/web --include="*.tsx"` returns only form-level Alert usages (or zero), not per-field `<p>` tags.

---

## Consumers — which molecules / organisms / surfaces use it

| Consumer | Surface / file | Field(s) |
|---|---|---|
| `SignInForm` (organism) | `apps/web/app/auth/sign-in-form.tsx` | Email, Password |
| `SignUpForm` (organism) | `apps/web/app/auth/sign-up-form.tsx` | Email, Password, Confirm password |
| `InviteGateForm` (organism) | `apps/web/app/signup/required/invite-gate-form.tsx` | Invite code |
| `InviteForm` (organism) | `apps/web/app/tools/invite/invite-form.tsx` | Recipient email, Invite code (+ `className="font-mono"`) |
| `ProfileEditForm` (organism) | `apps/web/app/profile/edit/edit-form.tsx` | Display name |
| `AnnouncementsManager` (organism) | `apps/web/app/captains/announcements/announcements-manager.tsx` | Announcement title |
| `QuestionField` (organism) | `apps/web/components/questionnaire/question.tsx` | `short_text` field kind (onboarding, questionnaire runner, my-forms replay) |
| `SignInForm` / `SignUpForm` → `AuthShell` (organism) | all auth surfaces (S02) | wrapper context |
| `AnnouncementsManager` → captain announcements (S16) | captain surface | title composer field |
| Future: `QuestionnaireWizard` onboarding steps that include `short_text` questions | S04 / S20 | via `QuestionField` |
