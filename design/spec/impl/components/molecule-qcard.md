# QCard — molecule plan

- **mapsTo:** NEW · Target file: `packages/ui/src/components/qcard.tsx`

---

## Current state — does it exist? where? gap vs spec

**Does not exist anywhere in the codebase.**

Search results confirm zero matches for `QCard`, `qcard`, or `q-card` in both
`packages/ui/src/components/` and `apps/web/`. There is no hand-rolled version to
PROMOTE — the component appears only in two design boards as a named frame drawn
directly inside its parent overlay, never extracted into a reusable instance.

**Board evidence (two consumers, identical anatomy):**

| Board | File | Frame name | Padding | Title size | Notes |
|---|---|---|---|---|---|
| S25 Questionnaire gate | `design/.spec-extract/boards/34-s25-questionnaire-gate.txt:13–21` | `"QCard"` | `pad:16 gap:10` | Inter/16px/700 | Full-screen routed gate |
| S22 Global overlays | `design/.spec-extract/boards/31-s22-global-overlays.txt:29–37` | `"QCard"` | `pad:14 gap:8` | Inter/15px/700 | App-blocking overlay variant |

The two boards draw the same structural anatomy (card surface, title, horizontal meta
row with `list-checks` + `timer` chips). The only numeric drift is `pad:16/gap:10`
(S25) vs `pad:14/gap:8` (S22) and `16px` vs `15px` title — minor density variants
of the same component. `design-tokens.md §1.2` locks the subtitle/card-title scale
to **16px** as the canonical default and **15px** only for dense list rows. Both
cases qualify as "card title", so default to 16px; expose `size="sm"` for the
overlay's tighter context.

**Gap vs spec (component-library.md `## QCard` entry):**

The spec entry (`component-library.md:353–359`) defines three props (`title`,
`questionCount`, `estimatedMinutes`) and a single default variant with a static
state. No merge-map absorbs (QCard appears nowhere in the merge map — it is a net-new
component with no duplicate candidates). The spec does not assign QCard to the
promote shortlist (`component-library.md:595–600`) — it is NEW and its two
consumers are in `apps/web`. The target is `packages/ui/src/components/qcard.tsx`
because both consumers (`QuestionnaireBlock` overlay in the global overlay system and
the routed S25 gate page) live in `apps/web` and the component-library entry says
"extract shared (two consumers)".

---

## API — props, variants, sizes, states

### Prop interface sketch

```tsx
interface QCardProps {
  /** Questionnaire display name. Board example: "Safety & logistics". */
  title: string;
  /**
   * Number of questions. Rendered as "{questionCount} questions".
   * Shown next to a `list-checks` icon.
   */
  questionCount: number;
  /**
   * Rough time estimate in whole minutes. Rendered as "about {n} minutes"
   * (or "about 1 minute" — the component handles singular/plural internally).
   * Shown next to a `timer` icon.
   */
  estimatedMinutes: number;
  /**
   * Size variant.
   * "default" — pad:16 gap:10 title:16px (S25 full-screen gate).
   * "sm"      — pad:14 gap:8  title:15px (S22 overlay, tighter container).
   */
  size?: "default" | "sm";
  className?: string;
}
```

### Variants

| Variant | Padding | Internal gap | Title size | Use case |
|---|---|---|---|---|
| `default` | 16px (all sides) | 10px | Inter 16px/700 (`--text-subtitle`) | S25 routed full-screen gate |
| `sm` | 14px (all sides) | 8px | Inter 15px/700 (`--text-subtitle` dense) | S22 overlay (`QuestionnaireBlock`); tighter vertical footprint |

### States

QCard is **static-presentational** — the spec entry states "States: static" and the
board draws no interactive, hover, or loading variant. It renders once with the
supplied props and changes only when its parent re-renders with new data.

There is one edge case to guard: if `questionCount` or `estimatedMinutes` is `0`
(e.g. a catalogue entry with incomplete metadata), the component still renders but
produces "0 questions" / "about 0 minutes". The parent (QuestionnaireBlock /
questionnaire gate page) is responsible for ensuring valid data before mounting
QCard; the component does not suppress or error on zero values.

---

## Tokens & type — exact design tokens + type-scale roles used

### Colour tokens (all semantic; no raw hex)

| Element | Token | CSS var |
|---|---|---|
| Card surface fill | `bg-card` | `--color-card` |
| Card border | `border-border` | `--color-border` |
| Title text | `text-foreground` | `--color-foreground` |
| Meta icon colour | `text-muted-foreground` | `--color-muted-foreground` |
| Meta label text | `text-muted-foreground` | `--color-muted-foreground` |

No status tokens (`success`/`warning`/`info`/`destructive`) are used — QCard carries
no state-bearing content. No raw hex; the boards' tints (`#ff008c2e`, `#00dcff08`)
live in the parent overlay frame, not inside the QCard frame.

### Typography roles

| Element | Token role | Face | Size | Weight | Notes |
|---|---|---|---|---|---|
| `title` | `--text-subtitle` | Inter | 16px (`text-base`) / 15px (`sm`) | 700 (`font-bold`) | S25 board: 16/700. S22 board: 15/700. Lock to canonical scale (design-tokens.md §1.2). |
| Meta chip labels (`"N questions"`, `"about M minutes"`) | `--text-caption` | Inter | 12px (`text-xs`) | 500 (`font-medium`) | Both boards: Inter/12px/500/`$muted-foreground`. |
| Meta icons (`list-checks`, `timer`) | n/a — icon, not text | Lucide SVG | 14px (`size-3.5`) | — | Both boards: 14px, `$muted-foreground`. |

No JetBrains Mono usage inside QCard. QCard is a pure content card; mono is reserved
for data-console/eyebrow/slug roles (design-tokens.md §1.1). The eyebrow
"REQUIRED QUESTIONNAIRE" above QCard on both boards is rendered by the parent
organism (`QuestionnaireBlock` / gate page), not by QCard itself.

### Radius

`--radius` (10px / `0.625rem`) — the default container radius per design-tokens.md §3.
Both boards specify `r:$radius`. Use `rounded-[--radius]` (or `rounded-md` alias
once token wiring lands per `foundations-tokens.md`).

---

## Composition & deps — atoms/primitives + @camp404/core helpers

QCard is a **pure presentational molecule** — no domain logic, no data fetching.

```text
QCard
  ├─ cn()             ← packages/ui/src/lib/utils (already in the package)
  └─ Lucide icons     ← lucide-react peer dep (already used across packages/ui)
       ├─ ListChecks  (list-checks icon — question count chip)
       └─ Timer       (timer icon — time estimate chip)
```

No `@camp404/core` helpers are needed. QCard has no rank-gating (`CaptainLock` is
the host organism's concern), no async state, and no form controls. It composes
purely via HTML elements + Tailwind + `cn()`.

QCard does NOT use the `Card` primitive from `packages/ui/src/components/card.tsx`.
The S25 surface brief (`design/spec/surfaces/23-questionnaire-gate.md:60`) notes
explicitly: "The `Card` reusable is NOT used — `QCard` is drawn directly in S25 with
its own local layout rather than as an instance of the canvas `Card` component." This
is intentional: QCard has a fixed single-purpose layout and should not inherit Card's
`variant` prop surface or sub-component API.

---

## Absorbs — merge-map candidates replaced

QCard does **not** appear in the merge-map table (`component-library.md` merge map
section). No inventory candidates collapse into it. There are no duplicate
hand-rolled versions anywhere in `apps/web` to delete after building.

The component is net-new with exactly two future consumers; it introduces no naming
collision with any existing or planned component.

---

## Stories & tests

### Storybook stories

```text
QCard.stories.tsx

  Default
    — size="default" (S25 density)
    — title="Safety & logistics", questionCount=8, estimatedMinutes=3
    — shows the canonical gate appearance

  SmVariant
    — size="sm" (S22 overlay density)
    — title="Safety & logistics", questionCount=8, estimatedMinutes=3
    — side-by-side with Default to show pad/gap/title-size delta

  LongTitle
    — size="default"
    — title="Dietary requirements & camp kitchen hygiene" (long string)
    — confirms title wraps cleanly without overflowing the meta row

  EdgeCaseSingular
    — questionCount=1, estimatedMinutes=1
    — confirms "1 question" (not "1 questions") and "about 1 minute" (not "minutes")

  DynamicCounts
    — Storybook controls (argTypes) wired for title/questionCount/estimatedMinutes
    — allows reviewers to sanity-check arbitrary catalogue entries
```

### Vitest / RTL test cases

```text
qcard.test.tsx

Rendering
  renders the title prop as a heading element
  renders "N questions" with list-checks icon present in the DOM
  renders "about M minutes" with timer icon present in the DOM
  applies bg-card and border-border class tokens to the root element
  applies rounded-[--radius] to the root element

Size variant
  size="default" applies padding-4 (16px) to root
  size="sm" applies padding-[14px] (14px) to root
  size="default" title uses text-base font-bold
  size="sm" title uses text-[15px] font-bold

Singular/plural
  questionCount=1 renders "1 question" (not "1 questions")
  estimatedMinutes=1 renders "about 1 minute" (not "minutes")
  questionCount=8 renders "8 questions"
  estimatedMinutes=3 renders "about 3 minutes"

className passthrough
  custom className merges with root classes without clobbering tokens

Snapshot
  default variant snapshot
  sm variant snapshot
```

### Accessibility notes

- The `title` prop should render as a heading element (`<h3>` or `<h2>` depending on
  document outline) so screen readers can identify the questionnaire name without
  having to read the meta chips. Default to `<h3>`; expose `as?: "h2" | "h3"` if
  consumers need to correct the heading level (the gate page's own `<h1>` is "Before
  you go any further", so QCard's title is logically `<h2>` within the page
  hierarchy). Add an `as` prop defaulting to `"h3"` and document the `<h2>` use case
  in the Storybook story.
- The `list-checks` and `timer` icons are decorative — they redundantly reinforce the
  text labels. Apply `aria-hidden="true"` to both icon elements; the text labels alone
  provide the accessible content.
- The meta row (`"N questions"`, `"about M minutes"`) does not need a `role="list"` —
  it is a horizontal display row, not a semantic list. Plain `<div>` with flex layout
  is correct.
- Ensure `text-muted-foreground` on `--color-card` background meets 3:1 contrast for
  large or decorative text (captions). `--color-muted-foreground` is `oklch(0.7 0.05
  325)` against `--color-card` `oklch(0.26 0.08 295)` — verify contrast in Storybook
  a11y plugin before shipping.

---

## Build steps

### Step 1 — Pre-requisite: token foundations confirmed

Verify `--radius`, `--color-card`, `--color-border`, `--color-foreground`, and
`--color-muted-foreground` are present in `packages/ui/src/styles/globals.css` as
Tailwind `@theme` entries. These already exist per design-tokens.md §2.1 and §3;
confirm against live `globals.css` before writing QCard.

**Acceptance:** `pnpm build` in `packages/ui` passes; token utilities (`bg-card`,
`border-border`, `text-foreground`, `text-muted-foreground`, `rounded-[--radius]`)
resolve without Tailwind warnings.

### Step 2 — Create `packages/ui/src/components/qcard.tsx`

Implement the component per the API section:

- Root `<div>`: `bg-card border border-border rounded-[--radius]` + size-variant
  padding (`p-4` for default, `p-[14px]` for sm) + size-variant gap (`gap-[10px]` /
  `gap-2`) + `flex flex-col`.
- Title `<h3>` (or `as` prop): `font-bold text-foreground` + `text-base` (default) /
  `text-[15px]` (sm).
- Meta row `<div>`: `flex gap-[14px] items-center`.
- Question chip `<div>`: `flex gap-[6px] items-center` → `<ListChecks
  className="size-3.5 text-muted-foreground" aria-hidden="true" />` + `<span
  className="text-xs font-medium text-muted-foreground">{questionCount} {questionCount
  === 1 ? "question" : "questions"}</span>`.
- Time chip `<div>`: `flex gap-[6px] items-center` → `<Timer className="size-3.5
  text-muted-foreground" aria-hidden="true" />` + `<span className="text-xs
  font-medium text-muted-foreground">about {estimatedMinutes} {estimatedMinutes === 1
  ? "minute" : "minutes"}</span>`.
- Use `cn()` for className merging on the root; pass `className` prop through.

**Acceptance:** component renders; TypeScript compiles clean; no raw hex or inline
style attributes; all tokens resolve to semantic CSS vars.

### Step 3 — Export from package barrel

Add `export { QCard } from "./components/qcard"` (and `export type { QCardProps }`)
to `packages/ui/src/index.ts` (or the package's barrel file, whichever pattern the
existing exports follow — confirm against `atom-badge.md` build pattern).

**Acceptance:** `import { QCard } from "@camp404/ui"` resolves in `apps/web` without
a path alias; TypeScript picks up the prop types.

### Step 4 — Write Storybook stories

Create `packages/ui/src/components/qcard.stories.tsx` with the five stories listed
above. Include an argTypes block wiring `title`, `questionCount`, and
`estimatedMinutes` as Storybook controls for the `DynamicCounts` story.

**Acceptance:** Storybook builds; all five stories render; the a11y plugin passes
(contrast, icon aria-hidden, heading semantics).

### Step 5 — Write Vitest/RTL tests

Create `packages/ui/src/components/qcard.test.tsx` covering the test cases in the
Stories & tests section above.

**Acceptance:** `pnpm test` green in `packages/ui`; all plural/singular branches
covered; no snapshot flakiness from dynamic content.

### Step 6 — Wire into consumer organisms

Both consumers are app-local organisms in `apps/web`. This step is NOT part of the
QCard build ticket itself — it belongs in the build tickets for the consuming
organisms. Document here for cross-reference:

- `QuestionnaireBlock` overlay (`apps/web` — surfaces/25-global-overlays) imports
  `QCard` from `@camp404/ui`; passes `title`, `questionCount`, `estimatedMinutes`
  derived from the `required_action` record + questionnaire catalogue
  (`apps/web/lib/questionnaire.ts`); uses `size="sm"` to match the S22 overlay
  density.
- Questionnaire gate page (`apps/web/app/onboarding/questionnaire/page.tsx` — surfaces/23-questionnaire-gate) imports `QCard` from `@camp404/ui`; uses
  `size="default"` (S25 density); for the initial build, passes static strings
  (`title="Safety & logistics"`, `questionCount={8}`, `estimatedMinutes={3}`) per the
  surface spec's open-question resolution (static copy until questionnaire-trio scope
  is confirmed — see `23-questionnaire-gate.md` open question 5).

**Acceptance (consumer step, not QCard step):** both surfaces render QCard with the
correct size variant; TypeScript clean; no inline duplication of the card layout.

---

## Consumers

| Consumer | Type | Surface spec | Size variant | Data source |
|---|---|---|---|---|
| Questionnaire gate page (`apps/web/app/onboarding/questionnaire/page.tsx`) | organism / page | `design/spec/surfaces/23-questionnaire-gate.md` | `default` (S25 pad:16 gap:10 title:16px) | Static strings for initial build; later parameterised from `required_action` + questionnaire catalogue |
| `QuestionnaireBlock` overlay organism (`apps/web` global overlay system) | organism | `design/spec/surfaces/25-global-overlays.md` | `sm` (S22 pad:14 gap:8 title:15px) | Derived from the blocking `required_action` record: `actionKey` → catalogue lookup → `title`, question count, time estimate |
