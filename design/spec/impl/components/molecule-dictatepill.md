# DictatePill — molecule plan

- **mapsTo:** PROMOTE `apps/web/components/voice/dictate-button.tsx`
- **Target file:** `packages/ui/src/components/dictate-pill.tsx`

---

## Current state — does it exist? where? gap vs spec

Two competing dictation trigger shapes exist in the codebase today, plus the board
draws a third canonical shape. None of the three is extracted as a shared
component.

### Shape 1 — `DictateButton` (live, in `@camp404/ui` vicinity)

**File:** `apps/web/components/voice/dictate-button.tsx`

A small vertical column: `Button size="sm"` (outline or destructive) + lucide
`Mic`/`Square`/`Loader2` icon + label text + `<Waveform>` beneath + error line.
Width is fixed `w-24`. It embeds its own `useVoiceRecorder` hook and waveform —
it is a self-contained micro-widget, not a dumb trigger.

The spec (`component-library.md`, decision #5 notes) marks `DictateButton` as
a **DROPPED dead orphan**: "DROPPED: `DictateButton` (dead orphan)". It is not
referenced by any consumer in `apps/web` (confirmed: `grep -r DictateButton
apps/web` returns only its own definition). The component-library also states the
live `apps/web` outline-button trigger should be unified into the pill shape.

### Shape 2 — Inline outline `Button` in `LongTextField` and `ReportBugDialog`

**Files:** `apps/web/components/questionnaire/question.tsx` (line 464–473) and
`apps/web/components/feedback/report-bug-dialog.tsx` (line 222–232)

Both hand-roll a `Button variant="outline"` with a `Mic` icon and "Dictate instead"
label. The two renders are not identical:

| Attribute | `question.tsx` | `report-bug-dialog.tsx` |
|---|---|---|
| `size` | `size="lg"` | `size="sm"` |
| `className` | `h-auto gap-3 self-end px-8 py-4` | `gap-2 self-start` |
| `radius` | inherits button's `$radius` (rect pill) | inherits button's `$radius` |
| Layout | full-width self-end | inline self-start |

Neither uses `r:999` — both render as a rectangular outline button, diverging from
the board's drawn pill.

### Shape 3 — Board-canonical `DictatePill` (spec target)

**Boards:** `41-ob-step-03-a-bit-about-you.txt` (line 17–19) and
`42-ob-step-04-burn-ideas.txt` (line 19–21).

Both boards draw the component by name:

```text
▸ "DictatePill" {gap:6 pad:[6,10] ai:center r:999 fill:$muted stroke:$border}
  ⊙ mic ($muted-foreground) [lucide]
  T "Dictate instead"  [Inter/12px/normal/$muted-foreground]
```

Positioned in a `PillRow` that is `jc:end` — the pill sits **above** the Textarea
aligned to the right edge (not below). This is the canonical geometry.

Board `14-s05-field-kinds.txt` (line 57–60) draws the field-kinds variant as a
full-width outline button (`r:$radius`, not `r:999`), labelled "DictateWrap /
Dictate". Surface spec `20-field-renderer.md` (line 163) explicitly reconciles
these two into **one `DictatePill`** with `r:999` (pill wins over rectangular
button).

### Gap summary

| Gap | Impact |
|---|---|
| No shared extracted component — each host hand-rolls its own trigger | NEW component required at `packages/ui` |
| Live triggers use `r:$radius` rectangular button; boards specify `r:999` pill | Shape must flip to `r:999` on all hosts |
| Live `question.tsx` trigger is `self-end` below the textarea; board puts pill `jc:end` **above** textarea | Placement is host layout responsibility, not the pill's own; document in § Consumers |
| `DictateButton` (vertical waveform variant) is a dead orphan — not used by any host | DELETE `apps/web/components/voice/dictate-button.tsx` |
| `report-bug-dialog.tsx` uses a bare Button, not a named component | Wire to `DictatePill` at refactor |
| `question.tsx` `LongTextField` uses a bare Button, not a named component | Wire to `DictatePill` at refactor |
| Announcement composer (`15-announcements.md` line 31) — `DictatePill` required; not yet coded | NEW consumer wiring required |
| Timer/waveform (`mmss`) lives in `RecorderPanel`, not in `DictatePill` | `DictatePill` is a stateless dumb trigger; `RecorderPanel` owns all recording state |

**Classification: PROMOTE** — the pattern exists across multiple `apps/web` inline
hand-rolls; lift the canonical pill shape into `packages/ui` and replace all
hand-roll instances. The `DictateButton` orphan (`dictate-button.tsx`) is
simultaneously **DELETED**.

---

## API — props, variants, sizes, states

### TS prop interface

```ts
export interface DictatePillProps {
  /**
   * Fired when the user taps the pill to open the RecorderPanel.
   * The host is responsible for mounting/unmounting RecorderPanel and
   * toggling `dictating` state. DictatePill is dumb — it does not own
   * recorder state.
   */
  onActivate: () => void;
  /**
   * Label displayed next to the mic icon.
   * @default "Dictate instead"
   */
  label?: string;
  /** Disabled during active recording / processing (host passes true). */
  disabled?: boolean;
  className?: string;
}
```

### Variants

`DictatePill` has a single canonical shape — the `r:999` pill. The legacy
rectangular outline ("outline" variant of `DictateButton`) is **deprecated and
deleted**; the pill is the one surviving form after reconciliation
(`20-field-renderer.md` line 163).

| Variant | Description |
|---|---|
| `pill` (default and only) | `r:999`, `bg-muted`, `stroke:$border`, mic icon in `text-muted-foreground`, label in `text-muted-foreground` |

No `variant` prop is needed because there is only one form.

### Sizes

One size from the boards: `pad:[6,10]` (`py-1.5 px-2.5` in Tailwind), `gap:6`
(`gap-1.5`), `Inter/12px/normal`. No size prop.

### States

| State | Trigger | Visual |
|---|---|---|
| `idle` (default) | `disabled` is false/undefined | Pill at full opacity; cursor pointer |
| `disabled` | `disabled={true}` (host sets while `RecorderPanel` is active) | `opacity-50 cursor-not-allowed pointer-events-none`; pill is inert |

`DictatePill` itself has no recording, processing, or error states — those belong
entirely to `RecorderPanel`. The pill simply fires `onActivate` and then the host
unmounts it, replacing it with `RecorderPanel`. The `disabled` prop handles the
one edge case where the host needs to suppress re-activation.

---

## Tokens & type — exact design tokens + type-scale roles

All tokens use the short Tailwind utility form (P1-5 — no `[color:var(--color-*)]`
verbose form). Dark-only app: no `dark:` variants.

### Layout and geometry

| Element | Token / utility | Source |
|---|---|---|
| Pill shape | `rounded-full` (`--radius-full` / `r:999`) | Boards 41 + 42 `r:999`; design-tokens.md §3 `--radius-full: 9999px` |
| Pill fill | `bg-muted` | Boards 41 + 42 `fill:$muted` |
| Pill border | `border border-border` | Boards 41 + 42 `stroke:$border` |
| Pill padding | `py-1.5 px-2.5` | Boards `pad:[6,10]` (top/bottom 6px, left/right 10px) |
| Icon/label gap | `gap-1.5` | Boards `gap:6` |
| Flex alignment | `flex items-center` | Boards `ai:center` |

### Icon

| Element | Token / utility | Source |
|---|---|---|
| Mic icon | Lucide `Mic`, `h-3.5 w-3.5` | Boards `⊙ mic` (size inferred from 12px label context; 14px icon is proportional) |
| Icon colour | `text-muted-foreground` | Boards `$muted-foreground` |

### Typography

| Element | Token / utility | Source |
|---|---|---|
| Label | `text-xs font-normal text-muted-foreground` (Inter 12px/normal) | Boards 41 + 42 `Inter/12px/normal/$muted-foreground`; maps to `--text-caption` role (design-tokens.md §1.1: 12px/400–500/`$muted-foreground`) |

`Inter/12px/normal` maps to the **caption** type role (`--text-caption`). The pill
label is meta/assistive copy — not a heading or body action, so caption is correct.
`font-mono` is not used here; `DictatePill` is a UI control, not a data-console
element.

### Focus ring

| Element | Token / utility | Source |
|---|---|---|
| Focus ring | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` | `$ring = $primary`; standard keyboard affordance |

---

## Composition & deps — atoms, primitives, helpers

### Direct dependencies

| Dep | Package | Role |
|---|---|---|
| `cn` | `@camp404/ui/lib/utils` | Tailwind class merging for `className` passthrough |
| `Mic` | `lucide-react` | Icon inside the pill |

`DictatePill` does **not** import:

- `useVoiceRecorder` — recording state lives in `RecorderPanel`, not here.
- `Button` — the pill is a plain `<button>` element styled as a pill, not a
  `Button` variant. Using `Button` would require overriding its `rounded-md`
  (rect) radius and height, creating fight with the pill's `r:999` geometry.
  A raw `<button>` is cleaner and makes the token-only styling self-evident.
- Any `@camp404/core` helper — `DictatePill` has zero domain knowledge; it is
  purely presentational.
- Any Next.js import — the component is presentation-only per the architecture
  constraint (`@camp404/ui` NEVER imports `next/*`).

`"use client"` directive is required: the component carries an `onClick` handler.

### Relationship to `RecorderPanel`

`DictatePill` and `RecorderPanel` are **siblings in the host's render tree**, not
parent/child. The host (`LongTextField`, `ReportBugDialog`, `AnnouncementsManager`)
owns a `dictating: boolean` state:

```text
dictating === false → render <DictatePill onActivate={() => setDictating(true)} />
dictating === true  → render <RecorderPanel onTranscript={…} onDismiss={() => setDictating(false)} />
```

`DictatePill` is not a wrapper around `RecorderPanel`.

---

## Absorbs — candidates replaced

| Candidate absorbed | Location | Action |
|---|---|---|
| `DictateButton` (dead orphan) | `apps/web/components/voice/dictate-button.tsx` | **DELETE.** No live consumer. The component-library.md DROPPED list explicitly names it. Verify with `grep -r "DictateButton" apps/web` before deleting. |
| Inline outline `Button` "Dictate instead" in `LongTextField` | `apps/web/components/questionnaire/question.tsx` ~line 464 | Replace with `<DictatePill onActivate={() => setDictating(true)} />` |
| Inline outline `Button` "Dictate instead" in `ReportBugDialog` | `apps/web/components/feedback/report-bug-dialog.tsx` ~line 222 | Replace with `<DictatePill onActivate={() => setDictating(true)} />` |

The merge map in `component-library.md` does not list `DictatePill` in the
consolidated merge table (its merge is implied by the DROPPED note for
`DictateButton` and the reconciliation note in `20-field-renderer.md`). No Badge,
Alert, or other canonical component absorbs into `DictatePill`.

---

## Stories & tests

### Storybook stories (`dictate-pill.stories.tsx`)

| Story | Props | Purpose |
|---|---|---|
| `Default` | `onActivate={() => {}}` | Baseline pill; idle state |
| `CustomLabel` | `onActivate={() => {}}`, `label="Start dictating"` | Label prop override |
| `Disabled` | `onActivate={() => {}}`, `disabled={true}` | Inactive/opacity-50 state while RecorderPanel is open |
| `ClickFires` | `onActivate={action("activated")}` | Storybook `@storybook/addon-actions` confirms `onActivate` fires on click |
| `KeyboardActivate` | (same as Default) | Confirm Enter/Space trigger `onActivate`; tested via RTL, story for visual verify |

All stories render against the dark theme background (`bg-background`) so the
`bg-muted` pill and `text-muted-foreground` resolve visibly.

### Vitest / RTL test cases (`dictate-pill.test.tsx`)

| Test | Assertion |
|---|---|
| Renders mic icon | `Mic` SVG present in DOM (via `aria-hidden` icon or role check) |
| Renders default label | Text "Dictate instead" in document |
| Renders custom `label` prop | Text matches supplied string |
| `onActivate` fires on click | `userEvent.click` → spy called once |
| `onActivate` fires on Enter keypress | `userEvent.keyboard("{Enter}")` → spy called once |
| `onActivate` fires on Space keypress | `userEvent.keyboard(" ")` → spy called once |
| Disabled: `onActivate` does NOT fire | `disabled={true}` → click → spy not called |
| Disabled: `pointer-events-none` class applied | `disabled={true}` → button has appropriate disabled attribute or class |
| `aria-disabled` set when `disabled` | `aria-disabled="true"` present (if native `disabled` attr is not used) |
| `className` passthrough | Custom className appears on root element |
| Has visible focus ring on keyboard focus | `focus-visible` class present after `userEvent.tab()` |

### Accessibility notes

- Root element is `<button type="button">` — participates in natural tab order,
  activated by Enter and Space without JS overrides.
- The lucide `Mic` icon is `aria-hidden="true"` (lucide default); the visible
  label text ("Dictate instead") is sufficient for screen-reader announcement.
- When a custom `label` prop is empty string, the `onActivate` button has no
  accessible name — the consumer must pass a non-empty label or wrap with
  an `aria-label`. Document this in JSDoc on the prop.
- `disabled` state: use the native HTML `disabled` attribute on the `<button>` so
  the browser removes it from tab order and announces "dimmed/unavailable". Do not
  rely on CSS-only `pointer-events-none` alone, which is invisible to AT.
- Touch target: the rendered pill at `py-1.5 px-2.5` + 12px text yields
  approximately 27px tall. This meets WCAG 2.5.8 (24×24 minimum). If the host
  places the pill in a tight layout, the consumer may pass a `className` to increase
  vertical padding.

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** `foundations-tokens` Phase 0 must have shipped (`--radius-full`
in the radius scale; `bg-muted`, `text-muted-foreground`, `border-border` utilities
resolving correctly via `globals.css`). The pill shape depends on `--radius-full`.

### Step 1 — Create `packages/ui/src/components/dictate-pill.tsx`

Build the component to the board spec:

```tsx
"use client";

import * as React from "react";
import { Mic } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";

export interface DictatePillProps {
  onActivate: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function DictatePill({
  onActivate,
  label = "Dictate instead",
  disabled = false,
  className,
}: DictatePillProps) {
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1.5",
        "text-xs font-normal text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <Mic className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
```

**Acceptance criteria:**
- `r:999` pill shape (not rectangular button).
- `bg-muted`, `border-border`, `text-muted-foreground` only — no raw hex, no
  `[color:var(--color-*)]` verbose tokens.
- `disabled` uses native HTML `disabled` attribute, not CSS-only.
- `className` prop merges correctly via `cn`.

### Step 2 — Export from `@camp404/ui`

Add to the package barrel / export map:

```ts
export { DictatePill } from "./components/dictate-pill";
export type { DictatePillProps } from "./components/dictate-pill";
```

**Acceptance:** `import { DictatePill } from "@camp404/ui/components/dictate-pill"`
resolves cleanly from `apps/web`.

### Step 3 — Wire into `apps/web/components/questionnaire/question.tsx`

In `LongTextField`, replace the inline `Button`:

```tsx
// Before (question.tsx ~line 463)
import { Mic } from "lucide-react";
// ...
<Button
  type="button"
  variant="outline"
  size="lg"
  onClick={() => setDictating(true)}
  className="h-auto gap-3 self-end px-8 py-4"
>
  <Mic className="h-5 w-5" />
  Dictate instead
</Button>

// After
import { DictatePill } from "@camp404/ui/components/dictate-pill";
// ...
<DictatePill onActivate={() => setDictating(true)} />
```

Note on placement: the boards draw the `DictatePill` in a `PillRow {jc:end}` row
**above** the Textarea, not below. The current live code places the button below.
Surface spec `20-field-renderer.md` reconciles this as a host-layout concern.
Moving to "above the Textarea" is part of the `LongTextField` host refactor
(molecule-longtextfield plan), not `DictatePill` itself. At this step, simply
replace the inline button; the host-layout pass follows in the `LongTextField` plan.

**Acceptance:** `question.tsx` renders the pill shape; `onActivate` fires and sets
`dictating = true`; `RecorderPanel` mounts as before.

### Step 4 — Wire into `apps/web/components/feedback/report-bug-dialog.tsx`

Replace the inline `Button`:

```tsx
// Before (~line 222)
<Button
  type="button"
  variant="outline"
  size="sm"
  className="gap-2 self-start"
  onClick={() => setDictating(true)}
>
  <Mic className="h-4 w-4" />
  Dictate instead
</Button>

// After
import { DictatePill } from "@camp404/ui/components/dictate-pill";
// ...
<DictatePill onActivate={() => setDictating(true)} />
```

**Acceptance:** `ReportBugDialog` renders pill shape; voice flow unchanged.

### Step 5 — Wire into announcements composer (new consumer)

In `apps/web/app/captains/announcements/` (the `AnnouncementsManager` organism,
once built per surface `15-announcements.md`), add:

```tsx
<DictatePill onActivate={() => setDictating(true)} />
```

below or above the Message `Textarea` per the `15-announcements.md` spec. This
step is gated on `AnnouncementsManager` build; mark as deferred until that organism
lands.

**Acceptance:** Dictate pill appears on message body in announcements composer;
fires `RecorderPanel` correctly; no home mic.

### Step 6 — Delete `apps/web/components/voice/dictate-button.tsx`

Verify no remaining imports:

```bash
grep -r "dictate-button\|DictateButton" apps/web --include="*.tsx" --include="*.ts"
```

If the grep returns zero results (confirming it is a dead orphan as per
`component-library.md`), delete the file.

**Acceptance:** file deleted; CI green; no import errors.

### Step 7 — RTL tests

Write `packages/ui/src/components/dictate-pill.test.tsx` covering the test matrix
above.

**Acceptance:** all tests pass via `pnpm --filter @camp404/ui test`.

### Step 8 — Storybook stories

Write `packages/ui/src/components/dictate-pill.stories.tsx` covering the stories
above.

**Acceptance:** all stories render without console errors; pill is visually
identifiable as `r:999`/`bg-muted` against the dark background.

---

## Consumers — which molecules/organisms/surfaces use DictatePill

| Consumer | File (current or target) | Relationship |
|---|---|---|
| `LongTextField` (organism) | `apps/web/components/questionnaire/question.tsx` | Renders `DictatePill`; toggles `dictating` state; mounts `RecorderPanel` on activate. Used by onboarding steps 03/04 (`long_text` bio + burn ideas), questionnaire runner (`long_text` questions), my-forms replay. |
| `ReportBugDialog` (organism) | `apps/web/components/feedback/report-bug-dialog.tsx` | Renders `DictatePill` on description field; no `promptKey` (generic transcription). |
| `AnnouncementsManager` (organism) | `apps/web/app/captains/announcements/` (target, not yet built) | Renders `DictatePill` on Message body (Decision 5 mandate; `15-announcements.md` line 31). |

`DictatePill` is **not** used on:

- Any home surface (no home mic — decision #5 / `information-architecture.md` line 251).
- Any surface that does not expose a `long_text` field.
- `RecorderPanel` itself — that is the sibling, not a consumer.
- Any atom in `@camp404/ui` — atoms never compose molecules.
