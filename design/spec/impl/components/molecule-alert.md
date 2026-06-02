# Alert — molecule plan

- **mapsTo:** PROMOTE (no existing `@camp404/ui/alert.tsx`; pattern is hand-rolled
  in `apps/web` across six consumer files)
- **Target file:** `packages/ui/src/components/alert.tsx`

---

## Current state — does it exist? where? gap vs spec

**`packages/ui/src/components/alert.tsx` — does NOT exist.** Verified by listing
`packages/ui/src/components/` — no `alert.tsx` is present.

The pattern is reinvented inline across every consumer:

| File | Pattern | Gap |
|---|---|---|
| `apps/web/app/auth/sign-in-form.tsx:140–142` | `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">` | Plain text, no border/fill, verbose off-token colour |
| `apps/web/app/auth/sign-up-form.tsx:133–137` | `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">` | Same as above |
| `apps/web/app/signup/required/invite-gate-form.tsx:52–55` | `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">` | Same plain-text pattern |
| `apps/web/app/tools/invite/invite-form.tsx:179–186` | `<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">` | Closest to spec: has border + fill + radius; short-token form; no icon, no title |
| `apps/web/app/profile/edit/edit-form.tsx:46–50` | `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">` | Plain text, verbose off-token |
| `apps/web/components/questionnaire/wizard.tsx:189–196` | `<p role="alert" className="rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive)]/10 px-3 py-2 text-sm text-[color:var(--color-destructive)]">` | Has border + fill; verbose token form |
| `apps/web/components/feedback/report-bug-dialog.tsx:255–262` | `<p role="alert" className="rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive)]/10 px-3 py-2 text-sm text-[color:var(--color-destructive)]">` | Identical duplication of wizard pattern |
| `apps/web/app/captains/announcements/announcements-manager.tsx:247–255` | Error: `<p className="text-sm text-destructive" role="alert">`; success: `<p className="text-sm text-emerald-400">` | Error = plain text; success = raw `emerald-400` (off-token; not `role="status"`) |
| `apps/web/app/mcp/connect/page.tsx:70–73` | `<p role="alert" className="text-xs text-destructive">` | Plain text; `xs` not spec body size |

**MemberNote** (`design/spec/surfaces/11-invite-tool.md:62–66`): described as "Row
`gap:10 pad:14 r:$radius fill:$muted`: Lucide `info` ($muted-foreground) + text …
(Inter 13px/normal/$muted-foreground)." — rendered today nowhere (the live
`invite-form.tsx` does not implement it; a new code branch is still needed).

**BlockingNotice** (`design/spec/surfaces/24-questionnaire-runner.md:31–33`):
"persistent destructive-tint banner: `gap:10 pad:[12,20] fill:#f83e5a1a stroke:$destructive` = lock icon ($destructive) + text." — does not exist in any `apps/web` file today (the blocking runner itself is not yet built).

**S24 board alerts** (`design/.spec-extract/boards/33-s24-primitive-kit.txt:94–106`):
two canonical examples drawn:
- "Heads up": `gap:10 pad:12 r:$radius fill:#00dcff1a stroke:$accent` + `info` icon
  + title "Heads up" (Inter/13/700) + body "Invites expire after 7 days."
  (Inter/12/$muted-foreground)
- "Couldn't save": `gap:10 pad:12 r:$radius fill:#f83e5a1a stroke:$destructive` +
  `triangle-alert` icon + title "Couldn't save" + body "Check your connection…"

**Gap summary:**
- No shared component — 9 inline reinventions; 7 of 9 are plain `<p>` tags (no
  icon, no title, no border, no fill tint).
- Raw `emerald-400` in announcements success notice — must become `text-success`.
- Verbose `[color:var(--color-*)]` token form across auth/profile/wizard — P1-5
  codemod target.
- `role="alert"` is used on error states; success/notice variants (`announcements-
  manager`) carry no ARIA live region at all.
- MemberNote and BlockingNotice do not yet exist as components anywhere.

---

## API — props, variants, sizes, states

```ts
import type { LucideIcon } from "lucide-react";

export type AlertTone = "info" | "warning" | "destructive" | "success";

export interface AlertProps {
  /** Semantic tone. Drives fill, border, icon colour. Required. */
  tone: AlertTone;
  /**
   * Optional Lucide icon component. When omitted the default per-tone icon is
   * used:
   *   info        → Info
   *   warning     → TriangleAlert
   *   destructive → TriangleAlert
   *   success     → CircleCheck
   * Pass `null` to suppress the icon entirely.
   */
  icon?: LucideIcon | null;
  /**
   * Optional bold title line (Inter/13/700/$foreground). Renders above children.
   * BoardS24: "Heads up" / "Couldn't save".
   */
  title?: string;
  /**
   * Alert body. Renders as Inter/12/$muted-foreground below title (if present),
   * or Inter/13/$foreground when there is no title (bare error line usage).
   */
  children?: React.ReactNode;
  /**
   * Persistent variant. When true the alert does not auto-hide and renders
   * without a dismiss affordance. Used for BlockingNotice (persistent=true,
   * tone="destructive"). Default false — consumers manage their own visibility.
   */
  persistent?: boolean;
  /** Additional className forwarded to the root element (host controls width). */
  className?: string;
}
```

**Variants** (driven by `tone`):

| Variant (tone) | Fill | Border | Icon | Role |
|---|---|---|---|---|
| `info` | `bg-accent/12` | `border-accent` | `Info` ($accent) | `role="status"` |
| `warning` | `bg-warning/12` | `border-warning` | `TriangleAlert` ($warning) | `role="status"` |
| `destructive` | `bg-destructive/12` | `border-destructive` | `TriangleAlert` ($destructive) | `role="alert"` |
| `success` | `bg-success/12` | `border-success` | `CircleCheck` ($success) | `role="status"` |

Fill alpha 12% matches the board's `#00dcff1a` (accent/12%) and `#f83e5a1a`
(destructive/12%), per the `design/spec/design-tokens.md §2.3` alpha snap table
(`1a` → 12%).

**`persistent=true` (BlockingNotice override):**
- `tone="destructive"` + `persistent={true}` = no dismiss; host places it in
  sticky chrome above the scrolling body (runner chrome).
- The fill and border are unchanged; horizontal padding widens to `px-5` (matching
  `pad:[12,20]` on the board vs `pad:12` for inline alerts).

**Sizes:** single size. The component is `w-full`; height is content-driven.
Padding: `p-3` (12px) standard; `py-3 px-5` for `persistent` banner.

**States:**

| State | Behaviour |
|---|---|
| shown | Rendered in the tree (consumer controls mounting/visibility). |
| hidden (success suppressed) | Consumer unmounts when an error is present; Alert has no internal toggle — zero data-show logic lives inside it (spec: "shown · hidden (success suppressed when error present)"). |

---

## Tokens & type — exact design tokens + type-scale roles

### Colour tokens

| Tone | Fill (bg) | Border | Icon + title | Body text |
|---|---|---|---|---|
| `info` | `bg-accent/12` | `border-accent` | `text-accent` | `text-muted-foreground` |
| `warning` | `bg-warning/12` | `border-warning` | `text-warning` | `text-muted-foreground` |
| `destructive` | `bg-destructive/12` | `border-destructive` | `text-destructive` | `text-muted-foreground` |
| `success` | `bg-success/12` | `border-success` | `text-success` | `text-muted-foreground` |

`--color-warning` and `--color-success` are NEW tokens defined in
`design/spec/impl/foundations-tokens.md` §2.2. Alert cannot ship until those two
tokens (and their `-foreground` pairs) land in `packages/ui/src/styles/globals.css`.
`--color-info` is `= --color-accent` (alias, not a separate token; confirmed
`design-tokens.md §2.2`).

### Type-scale roles (from `design-tokens.md §1.1`)

| Element | Role | Face | Size | Weight |
|---|---|---|---|---|
| `title` | `--text-label` | Inter | 13px | 700 |
| Body with title present | `--text-caption` | Inter | 12px | 400 |
| Body without title (bare error) | `--text-body` | Inter | 13–14px | 400 |
| Icon | 16×16 (`size-4`) | — | — | — |

No JetBrains Mono in Alert — this is prose/status copy, not terminal data.

### Radius

`rounded-md` = `--radius` (0.625rem / 10px) matching `r:$radius` on both S24
board examples.

---

## Composition & deps — atoms/primitives + helpers

- **`cn`** from `../lib/utils` — same utility used by every `@camp404/ui` component
  (confirmed in `packages/ui/src/components/button.tsx`, `checkbox.tsx`,
  `textarea.tsx`).
- **`cva`** from `class-variance-authority` — matches the `button.tsx` pattern for
  variant-driven class composition.
- **Lucide React** icons: `Info`, `TriangleAlert`, `CircleCheck` — already a peer
  dep of `@camp404/ui` (used by existing components). No new dep.
- **No `@camp404/core` dependency** — Alert is a pure presentation atom-of-atoms;
  it has no business logic, no validation, no rank check. It composes only CSS
  classes and children.
- No Radix primitive needed — the component is a plain `div` with ARIA role, not an
  interactive control (no Dialog, Popover, etc.).

---

## Absorbs — candidates replaced (from merge map)

Per `design/spec/component-library.md` merge map entry for Alert:

| Absorbed candidate | Where today | Replacement |
|---|---|---|
| `Alert` / `inline-alert` | Inline `<p role="alert">` in wizard, bug dialog, invite-form | `<Alert tone="destructive">` |
| `BlockingNotice` | Does not exist yet | `<Alert tone="destructive" persistent>` |
| `MemberNote` | Does not exist yet (spec: invite-tool.md §5) | `<Alert tone="info">` (muted note style — no title, body only; icon suppressed or `Info`) |
| Error banners (validation/server/save-failed) | Inline `<p>` in auth/gate/profile/wizard | `<Alert tone="destructive">` |
| Success banners (Draft saved / Published) | Inline `<p className="text-emerald-400">` in announcements-manager | `<Alert tone="success">` |
| S24 board alerts ("Heads up" / "Couldn't save") | Board-only; no code | `<Alert tone="info" title="Heads up">` / `<Alert tone="destructive" title="Couldn't save">` |

No other component in the 49-item canonical library is duplicated by Alert — the
merge map is exhaustive for this entry.

---

## Stories & tests

### Storybook stories

```
Alert.stories.tsx (packages/ui/src/components/)

Story: AllTones
  — renders one Alert per tone (info/warning/destructive/success)
  — each with default icon, title, and body copy

Story: TitleOnly
  — tone="info", title="Heads up", no children

Story: BodyOnly
  — tone="destructive", no title, children="Sign in failed."
  — validates bare error-line usage (no title, body in body font)

Story: CustomIcon
  — tone="warning", icon=ShieldAlert, title="Captain access required"

Story: NoIcon
  — tone="success", icon=null, children="Draft saved."

Story: Persistent (BlockingNotice)
  — tone="destructive", persistent=true
  — children="You can't use the app until this is finished."
  — confirm wider horizontal padding

Story: MemberNote
  — tone="info", icon=null (or Info), no title
  — children="Anyone who signs up with this code will need a captain's approval…"

Story: InteractivePlayground (args table)
  — all props exposed as Storybook controls
```

### Vitest / RTL test cases

```
alert.test.tsx (co-located or packages/ui/src/components/__tests__/)

— renders nothing unusual when shown (smoke)
— applies role="alert" for tone="destructive"
— applies role="status" for tone in {info, warning, success}
— renders title when provided
— renders children as body
— renders default icon when icon prop is omitted
— renders no icon when icon={null}
— renders custom icon when icon prop is a LucideIcon
— applies persistent padding class when persistent=true
— does NOT apply persistent class when persistent=false (default)
— applies correct tone CSS classes for each of the four tones
— forwards className to root element
```

### Accessibility notes

- `role="alert"` on `tone="destructive"`: screen readers announce immediately on
  mount (live region `assertive`). Correct for validation errors and server errors.
- `role="status"` on `tone` in `{info, warning, success}`: `polite` live region;
  announced when the SR is not busy. Correct for "Draft saved." and "Heads up."
  notices.
- Icon is `aria-hidden="true"` — decorative; meaning is carried by the text.
- The `title` element and `children` together form the accessible label; no extra
  `aria-label` or `aria-describedby` is needed on the Alert itself.
- Consumers that gate visibility on state (e.g. `{error && <Alert …>}`) must mount
  the Alert into a stable DOM position so the live-region announcement fires on
  insertion; do not use CSS `opacity: 0` to hide it.

---

## Build steps — ordered + acceptance criteria

### Step 1 — Status tokens prerequisite

**Prerequisite (not this ticket).** `--color-success`, `--color-success-foreground`,
`--color-warning`, `--color-warning-foreground` must be defined in
`packages/ui/src/styles/globals.css` `@theme` before step 2 can pass visual review.
Tracked in `design/spec/impl/foundations-tokens.md`. Do not ship Alert to consumers
until this is done.

**Acceptance:** `bg-success/12 border-success text-success` and their warning
equivalents resolve to visible colours in the browser.

### Step 2 — Build `packages/ui/src/components/alert.tsx`

Implement the component per the API sketch above. Use `cva` for tone variants
(matching the `button.tsx` pattern). Export named `Alert` + the `AlertTone` type.

**Acceptance criteria:**
- File exists at `packages/ui/src/components/alert.tsx`.
- All four tones render correct fill / border / icon colour per the token table.
- `role="alert"` for destructive; `role="status"` for others.
- `persistent=true` applies `py-3 px-5`; default applies `p-3`.
- `icon=null` suppresses the icon element entirely.
- Custom `icon` prop renders that icon in place of the default.
- `className` forwarded to root `div`.
- No raw hex, no `emerald-*`, no `amber-*`, no verbose `[color:var(--color-*)]` in
  the component source.

### Step 3 — Add Storybook stories

Create `packages/ui/src/components/alert.stories.tsx` with all stories listed
above.

**Acceptance:** `pnpm storybook` (or equivalent) renders all Alert stories without
error; the AllTones story shows visually distinct fills for all four tones.

### Step 4 — Add vitest/RTL tests

Create `packages/ui/src/components/__tests__/alert.test.tsx` (or alongside the
component) with all test cases listed above.

**Acceptance:** `pnpm test` in `packages/ui` passes all Alert tests; coverage
includes role, icon, title, children, persistent, className.

### Step 5 — Replace inline reinventions in `apps/web`

Swap every hand-rolled `<p role="alert">` and inline banner across the nine consumer
files with `<Alert tone={…}>`. Specific files (verified above):

- `apps/web/app/auth/sign-in-form.tsx`
- `apps/web/app/auth/sign-up-form.tsx`
- `apps/web/app/signup/required/invite-gate-form.tsx`
- `apps/web/app/tools/invite/invite-form.tsx`
- `apps/web/app/profile/edit/edit-form.tsx`
- `apps/web/components/questionnaire/wizard.tsx`
- `apps/web/components/feedback/report-bug-dialog.tsx`
- `apps/web/app/captains/announcements/announcements-manager.tsx`
  (error → `<Alert tone="destructive">`; success `text-emerald-400` →
  `<Alert tone="success">`)
- `apps/web/app/mcp/connect/page.tsx`

**Acceptance:** zero remaining `text-emerald-400` / `text-[color:var(--color-
destructive)]` bare `<p role="alert">` patterns in the listed files; ESLint / TS
passes; visual output identical on affected surfaces.

### Step 6 — Add MemberNote usage in InviteForm

When `InviteForm` is built (or when the invite-form PROMOTE lands), render:
```tsx
<Alert tone="info" icon={null}>
  Anyone who signs up with this code will need a captain's approval before they
  can use the app.
</Alert>
```
in the member branch (`!isCaptain`), replacing the spec's planned
`MemberNote` inline component.

**Acceptance:** member-variant of invite-form shows the info banner; captain-variant
shows `CaptainOptions` with no banner.

### Step 7 — Add BlockingNotice usage in QuestionnaireRunner

When `BlockingTopBar` / blocking runner is built, render:
```tsx
<Alert tone="destructive" persistent>
  You can't use the app until this is finished.
</Alert>
```
in the sticky chrome band below `BlockingTopBar`.

**Acceptance:** the persistent banner renders full-width, non-dismissable, with
wider horizontal padding below the top bar on the blocking runner surface.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | Surface/file | Usage |
|---|---|---|
| `SignInForm` | `apps/web/app/auth/sign-in-form.tsx` | Destructive — server/validation error |
| `SignUpForm` | `apps/web/app/auth/sign-up-form.tsx` | Destructive — server/validation error |
| `InviteGateForm` | `apps/web/app/signup/required/invite-gate-form.tsx` | Destructive — server error |
| `InviteForm` (organism) | `apps/web/app/tools/invite/invite-form.tsx` | Destructive — server error; Info (MemberNote) — member-variant notice |
| `ProfileEditForm` | `apps/web/app/profile/edit/edit-form.tsx` | Destructive — server/save error |
| `QuestionnaireWizard` | `apps/web/components/questionnaire/wizard.tsx` | Destructive — form error / save-failed |
| `ReportBugDialog` | `apps/web/components/feedback/report-bug-dialog.tsx` | Destructive — submission error |
| `AnnouncementsManager` | `apps/web/app/captains/announcements/announcements-manager.tsx` | Destructive — action error; Success — Draft saved / Published |
| `MCPConsent` / connect page | `apps/web/app/mcp/connect/page.tsx` | Destructive — sign-in error |
| `QuestionnaireRunner` (not yet built) | blocking runner surface | Destructive + persistent — BlockingNotice |
| `AuthShell` (organism, composed) | various auth surfaces | Destructive — inherited from child form |
