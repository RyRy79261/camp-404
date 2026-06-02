# Input — atom plan

- **mapsTo:** REUSE `packages/ui/src/components/input.tsx`
- **Target file:** `packages/ui/src/components/input.tsx` (extend in place — no new file)

---

## Current state — does it exist? Where? Gap vs spec

The component exists at `packages/ui/src/components/input.tsx` and is already consumed
directly by every surface that needs it. All 24 call-sites in `apps/web` import from
`@camp404/ui/components/input` — no hand-rolled duplicate was found anywhere.

**Gaps vs spec (grounded in actual files):**

| Gap | Evidence |
|---|---|
| No `aria-invalid` / error-border styling baked in | `input.tsx` line 12: zero `aria-invalid` or `data-[invalid]` variant; error state is applied ad-hoc via `className` by callers (no current call-site does even this — errors are shown as sibling `<p>` elements outside the input). |
| `ring-offset-background` token referenced but undefined | `input.tsx` line 12 uses `ring-offset-background`; `globals.css` defines no `--color-ring-offset-background` token — it falls back to the browser default (white), which is wrong on the dark theme. |
| `bg-background` used for input fill, not `bg-muted` | `globals.css` `--color-muted: oklch(0.22 0.06 295)` is the auth/surface background (spec §2.1 confirms this). The boards draw input fields on the `$muted` surface — the filled-input background should be `bg-muted` so it recedes into the surface, consistent with how shadcn new-york normally wires it. Currently `bg-background` makes inputs the same shade as the app base, which on the dark theme is indistinguishable from the outer background. |
| `rounded-md` hardcoded, not radius-token-driven | `input.tsx` line 12: `rounded-md`; `design-tokens.md` §3 requires replacing all `rounded-md` with the `--radius` token utility once the radius system is wired (P1-6 follow-up). |
| `text-sm` (14px) is correct; no `font-mono` variant | The invite-form applies `className="font-mono"` externally (invite-form.tsx line 164). The spec names `mono` as a variant — it should be a documented/tested prop-path, not a consumer-injected className. |
| No `type="search"` visual affordance | The search-input pattern in roster and family-tree wraps Input in a `relative` div with an absolutely positioned `<Search>` icon and a `pl-8` className injected externally. The spec lists `search` as a named variant (leading icon via wrapper). The atom plan documents this as the correct host-wrapper pattern; no structural change to `<input>` itself is required — but it must be tested and storied. |
| `date` type picker indicator already patched globally | `globals.css` lines 52-55 already flip the webkit calendar indicator for dark mode. No per-component fix needed; document it. |
| Storybook coverage thin | `input.stories.tsx` has only 3 stories (Default, Disabled, Email). Missing: Password, Date, Search, Mono, Error state. |

---

## API — props, variants, sizes, states

The component is a thin `forwardRef` wrapper over a native `<input>`. The API stays
native-attrs-pass-through — no new prop abstraction is introduced at the atom level.
The `InputField` molecule (PROMOTE — separate plan) owns Label + helper + error message.

### TS prop interface (target)

```ts
// packages/ui/src/components/input.tsx

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Explicit mono-font variant for slug / code / ID inputs.
   * Consumers may also pass className="font-mono" directly —
   * this prop is a convenience alias that forwards to className.
   *
   * Equivalent to adding `font-mono` to className.
   */
  mono?: boolean;
}
```

`mono` is the only new named prop. Everything else is the existing `React.InputHTMLAttributes<HTMLInputElement>` spread.

### Variants

| Variant | Mechanism | Example consumer |
|---|---|---|
| `text` (default) | `type="text"` (omit or explicit) | profile edit display name |
| `email` | `type="email"` | sign-in, sign-up, invite-form |
| `password` | `type="password"` | sign-in, sign-up |
| `date` | `type="date"` | questionnaire `date` kind |
| `search` | `type="search"` + host provides leading icon wrapper + `pl-8` className | roster, family-tree |
| `mono` | `mono` prop (or `className="font-mono"`) | invite code field (invite-form.tsx:164) |

No `variant` prop needed — all differentiation is via native `type` + the single `mono`
convenience prop + `className` for one-off overrides. The spec comment "leading icon via
wrapper" confirms the search pattern is a host-wrapper concern, not an atom API concern.

### Sizes

One size: `h-10` / `px-3 py-2`. No size variants — the spec defines none. `className`
override handles any edge case.

### States

| State | Styling |
|---|---|
| Empty / placeholder | `placeholder:text-muted-foreground` (already present) |
| Populated | default foreground |
| Focus | `focus-visible:ring-2 focus-visible:ring-ring` — ring colour = `$ring` = `$primary` (magenta) |
| Disabled | `disabled:cursor-not-allowed disabled:opacity-50` (already present) |
| Error | `aria-invalid="true"` → `aria-invalid:border-destructive aria-invalid:ring-destructive` (to add) — host sets `aria-invalid` when field has an error; the atom styles the ring/border accordingly |

The error state is set by the **host** (InputField molecule or form organism) via
`aria-invalid={!!error}`. The atom adds the `aria-invalid:` variant selectors so it
responds correctly without requiring the host to inject a className.

---

## Tokens & type roles used

All tokens from `packages/ui/src/styles/globals.css` and `design/spec/design-tokens.md`.

| Element | Token | Type role |
|---|---|---|
| Input fill | `bg-muted` | `--color-muted` — recedes into surface (fix from current `bg-background`) |
| Border (default) | `border-input` | `--color-input` (= `--color-border`, `oklch(0.35 0.1 305)`) |
| Border (focus) | ring via `ring-ring` | `--color-ring` = `$primary` (hot-magenta) |
| Border (error) | `aria-invalid:border-destructive` | `--color-destructive` |
| Ring (error) | `aria-invalid:ring-destructive` | `--color-destructive` |
| Placeholder text | `placeholder:text-muted-foreground` | `--color-muted-foreground` — Inter 14px, `--text-body` role |
| Input text | `text-foreground` (implicit via body) | `--color-foreground` — Inter 14px, `--text-body` role |
| Mono variant text | `font-mono` | `--font-mono` → JetBrains Mono — `--text-mono` role (14px/500, invite slug) |
| Radius | `rounded-md` → `r-[--radius]` (P1-6 follow-up) | `--radius` = 0.625rem |
| Focus ring offset | remove `ring-offset-background` / `ring-offset-2` — or add `--color-ring-offset` token pointing to background (P1-6) | — |

**Status tokens:** Input itself does not use `success`/`warning`/`info` tokens. Error
state uses `destructive` only. Status token dependency lives in `InputField` (the molecule
host), not here.

**Dark-only:** no `dark:` variant classes. The palette is dark-only (confirmed in
`globals.css` and spec conventions).

---

## Composition & deps

The atom has **zero runtime dependencies** beyond React. It does not import Radix, CVA,
or any other library.

```
input.tsx
└── cn()   ← packages/ui/src/lib/utils.ts  (className merge)
```

No `@camp404/core` helpers needed at this atom level.

The `mono` prop implementation is:

```ts
cn(
  "... existing classes ...",
  mono && "font-mono",
  className
)
```

---

## Absorbs

The **merge map** lists no candidates absorbed into Input. Input is the canonical
primitive — it does not fold other inventory items.

The `type="date"` usage (questionnaire `date` kind) is the `date` variant listed in the
spec. The `DateControl` molecule (separate plan) wraps this Input; the atom itself needs
no change for date support beyond confirming the webkit calendar-picker fix already in
`globals.css`.

The `font-mono` invite-code field (currently `className="font-mono"` externally at
`invite-form.tsx:164`) is absorbed into the `mono` prop so the intent is explicit and
testable.

No dead components are deleted here — `control-panel.tsx`, `control-grid.tsx`, and
`quadrant-nav.tsx` are separate DELETE items (not related to Input).

---

## Stories & tests

### Storybook stories (`input.stories.tsx`)

Extend the existing file. Add:

| Story | Args |
|---|---|
| `Default` | `placeholder="Camp name"` (exists) |
| `Disabled` | `disabled, value="Camp 404"` (exists) |
| `Email` | `type="email", placeholder="you@camp-404.com"` (exists) |
| `Password` | `type="password", placeholder="••••••••"` |
| `Date` | `type="date"` |
| `SearchWrapper` | wraps Input in relative div with `<Search>` icon + `className="pl-8"` — documents the host pattern |
| `Mono` | `mono={true}, placeholder="wild-slug-7"` |
| `ErrorState` | `aria-invalid="true", value="bad@"` — shows destructive ring |
| `ErrorStateEmpty` | `aria-invalid="true"` — empty field in error state |

### Vitest / RTL tests (new file `input.test.tsx`)

| Test | What to assert |
|---|---|
| renders native `<input>` element | `screen.getByRole('textbox')` resolves |
| forwards ref | ref points at the DOM input |
| passes `type` through | `type="email"` sets `input.type === 'email'` |
| `disabled` sets `input.disabled` | attribute present; element has `cursor-not-allowed` class |
| `placeholder` attribute wired | `input.placeholder` matches |
| `mono` prop adds `font-mono` class | `input.className` includes `font-mono` |
| `className` merges without duplicates | `cn` output is clean |
| `aria-invalid="true"` present on error | host sets `aria-invalid`; input has `aria-invalid="true"` attribute |
| error border style applied | `aria-invalid:border-destructive` selector active (can assert class or computed style via snapshot) |
| `type="date"` renders | `input.type === 'date'`; no crash |
| forwards native event handlers | `onChange` fires on `userEvent.type` |

### A11y notes

- The atom itself is a native `<input>` — screenreader label association is the host's
  responsibility (`htmlFor` on the wrapping `<Label>`; `id` passed as prop).
- Error state uses `aria-invalid="true"` (native ARIA attribute), not a custom
  `data-error` attribute. This is the correct ARIA pattern for invalid form fields.
- The `InputField` molecule (host) must also render `aria-describedby` pointing at the
  error message `<p>` element — this is documented in the InputField plan, not here.
- `type="password"` inputs must not receive `autocomplete="off"` unless intentionally
  blocking — consumers should pass `autoComplete="current-password"` or
  `"new-password"` as appropriate (observed correctly in sign-in-form.tsx and
  sign-up-form.tsx).

---

## Build steps

All steps are **plan-doc only** (no code changes are made at this stage, per spec LOCKED
constraint). These are the ordered tasks for implementation.

**Step 1 — Fix `bg-muted` fill** (acceptance: input background visually recedes into the
dark surface, distinguishable from the app base)
- Change `bg-background` → `bg-muted` in the class string on `input.tsx:12`.
- Confirm in Storybook on the dark theme: the input well is `$muted`, not `$background`.

**Step 2 — Add `aria-invalid` error styles** (acceptance: field with `aria-invalid="true"` shows destructive border and ring; field without it is unchanged)
- Add `aria-invalid:border-destructive aria-invalid:ring-destructive` to the class string.
- Drop the stale `ring-offset-background` and `ring-offset-2` utilities (no `ring-offset`
  token exists; the offset creates an unwanted white halo on the dark theme). Replace with
  direct `focus-visible:ring-2 focus-visible:ring-ring` only.

**Step 3 — Add `mono` prop** (acceptance: `<Input mono />` renders with `font-mono`;
`className="font-mono"` still works as a pass-through)
- Extend `InputProps` with `mono?: boolean`.
- Add `mono && "font-mono"` in `cn()` call before the consumer `className`.
- Update invite-form.tsx to use `mono` prop instead of `className="font-mono"` (optional
  cleanup; both work).

**Step 4 — Storybook stories** (acceptance: all 9 stories listed above render in Storybook
without warnings)
- Extend `input.stories.tsx` with the missing stories.

**Step 5 — Vitest / RTL tests** (acceptance: all test cases listed above pass, coverage
includes every variant/state)
- Create `packages/ui/src/components/input.test.tsx`.

**Step 6 — Radius token follow-up (P1-6, deferred)** (acceptance: `rounded-md` replaced
by Tailwind utility driven by `--radius` token across the package)
- This is a package-wide radius codemod — do not do it in isolation on Input alone. Track
  against the foundations-tokens plan.

---

## Consumers

**Molecules that compose Input directly:**
- `InputField` (PROMOTE, `@camp404/ui/input-field.tsx`) — the primary molecule wrapper; owns Label + helper + error display. All form surfaces should ultimately reach Input via InputField.
- `DateControl` (REUSE `@camp404/ui/input.tsx` `type="date"`) — wraps Input with the date kind.

**Organisms that use Input directly today (should migrate to InputField):**
- `SignInForm` / `SignUpForm` — `apps/web/app/auth/sign-*-form.tsx` (inline Label+Input pairs; migrate to InputField).
- `InviteForm` — `apps/web/app/tools/invite/invite-form.tsx` — email + code (mono) fields.
- `AnnouncementsManager` — `apps/web/app/captains/announcements/announcements-manager.tsx` — title field.
- `EditForm` (profile edit) — `apps/web/app/profile/edit/edit-form.tsx` — display name.
- `InviteGateForm` — `apps/web/app/signup/required/invite-gate-form.tsx` — invite code entry.
- `DeleteAccount` — `apps/web/app/profile/edit/delete-account.tsx` — confirmation field.

**Organisms that use Input as a search field (host-wrapper pattern):**
- `RosterToolbar` / `camp-management-roster.tsx` — search input with leading Search icon + `pl-8 className`.
- `FamilyTree` — `apps/web/app/family-tree/family-tree.tsx` — name/code search with same leading-icon wrapper.

**QuestionField organism (questionnaire engine):**
- `apps/web/components/questionnaire/question.tsx` — `short_text` kind (line 177) and `date` kind (line 196).
