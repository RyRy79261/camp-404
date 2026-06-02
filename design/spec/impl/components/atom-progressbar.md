# ProgressBar — atom plan

- **mapsTo:** PROMOTE `apps/web/components/questionnaire/wizard.tsx` (private `ProgressBar` fn, lines 263–278)
- **Target file:** `packages/ui/src/components/progress-bar.tsx`

---

## Current state — does it exist? Where? Gap vs spec

**Exists as a private function inside `apps/web/components/questionnaire/wizard.tsx` (lines 263–278).** It is not exported, not in `@camp404/ui`, and carries no unit tests or stories.

Current implementation accepts only `{ current: number; total: number }` and renders:

- a `h-1.5` (6px) full-radius track in `bg-muted` (via verbose `bg-[color:var(--color-muted)]`)
- a `$primary` fill div with inline `width: ${pct}%` and a `transition-[width]`
- a single `text-xs text-muted-foreground` line: "Step {current} of {total}"

**Gaps vs spec (citing files):**

| Gap | Source |
|---|---|
| No right-aligned mono `NN%` in `$accent` | S04 board `ProgressLabelRow` (13-s04-onboarding-wizard.txt:11–13); surface spec 04-onboarding-wizard.md §3 and §Divergences item 7 |
| Label text is Inter/`text-xs` (12px/normal); spec requires JetBrains Mono 12px/500 | S04 board: `[JetBrains Mono/12px/normal/$muted-foreground]`; design-tokens.md `--text-mono-caption` role; surface spec 04 §3 |
| Track height `h-1.5` (6px) but uses `rounded-full`; spec draws track `h:6 r:3` (3px radius, not full) for the runner variant | S26 board `ProgressTrack/ProgressFill` (35-s26-questionnaire-runner.txt:17–18) |
| No `labelMode` prop — always says "Step"; runner requires "Question" | S26 board "Question 3 of 8" (line 16); surface spec 24-questionnaire-runner.md §1 ProgressRow |
| No `showPercent` prop — always hides the `NN%` accent label | S04 adds percent; runner board omits it; both consumers need a toggle |
| Verbose off-token colour class `bg-[color:var(--color-muted)]` / `bg-[color:var(--color-primary)]` | design-tokens.md §Reconciliations/Typography item 22 (short-form token codemod) |
| No `aria-label` / `role="progressbar"` / `aria-valuenow` / `aria-valuemin` / `aria-valuemax` | a11y requirement; absent in current code |
| Component is app-local and not promotable to other consumers without copy-paste | component-library.md `mapsTo: PROMOTE → @camp404/ui/progress-bar.tsx` |

The `@camp404/ui` package has no `progress-bar.tsx` — confirmed by `find packages/ui/src/components -type f` output.

---

## API — props, variants, sizes, states

### TypeScript prop interface

```ts
export interface ProgressBarProps {
  /** Current step/question index (1-based). */
  current: number;
  /** Total steps/questions. Must be >= 1. */
  total: number;
  /**
   * Controls the left-label prefix word.
   * "step"     → "Step {current} of {total}"     (onboarding wizard, default)
   * "question" → "Question {current} of {total}" (blocking questionnaire runner)
   */
  labelMode?: "step" | "question";
  /**
   * When true renders a right-aligned mono `NN%` label in $accent.
   * Onboarding wizard: true (ported from S04 ProgressLabelRow).
   * Blocking runner:   false (S26 board omits the percent).
   * Default: false.
   */
  showPercent?: boolean;
  /** Additional class names for the root wrapper. */
  className?: string;
}
```

### Variants

| Variant | `labelMode` | `showPercent` | Consumer |
|---|---|---|---|
| `step-paged` | `"step"` (default) | `true` | Onboarding wizard (QuestionnaireWizard) |
| `question-paced` | `"question"` | `false` | Blocking runner (BlockingTopBar) |

### Sizes

The track height is fixed by context:
- `h-1.5` (6px) with `rounded-full` — onboarding wizard (S04 `Track h:8 r:999`)
- `h-1.5` (6px) with `rounded-sm` (3px via `--radius-sm` snap) — blocking runner (S26 `ProgressTrack h:6 r:3`)

Because both consumers draw `h:6`/`h:8` at 6px and differ only in corner radius, the track radius is driven by `labelMode`: `question` → `rounded-sm`, `step` → `rounded-full`. This avoids a bespoke size prop for a two-pixel difference.

### States

- **Static** — the component is presentational only; it reflects the externally controlled `current`/`total` values. No internal state.
- **Fill transition** — `transition-[width]` CSS on the fill div; motion is display-layer only.

Percent clamp: `pct = Math.round((current / total) * 100)`, clamped to `[0, 100]` (defensive: `Math.min(100, Math.max(0, pct))`).

---

## Tokens & type — exact design tokens + type-scale roles

### Colour tokens (short-form, no raw hex)

| Element | Token |
|---|---|
| Track background | `bg-muted` |
| Fill bar | `bg-primary` |
| "Step/Question N of M" text | `text-muted-foreground` |
| "NN%" percent text | `text-accent` |

No status tokens (`success`/`warning`/`info`) are needed by this component. No raw hex tints — the current verbose `bg-[color:var(--color-muted)]` / `bg-[color:var(--color-primary)]` usage must be replaced with short-form utilities (`bg-muted`, `bg-primary`), per design-tokens.md §Reconciliations item 22.

### Type-scale roles

| Element | Role (design-tokens.md §1.1) | Tailwind realisation |
|---|---|---|
| "Step N of M" label | `--text-mono-caption` — JetBrains Mono 12px/500, lh 1.4 | `font-mono text-[12px] font-medium` (snap to `--text-mono-caption`) |
| "NN%" percent | `--text-mono-caption` — JetBrains Mono 12px/normal | `font-mono text-[12px]` |

Both label elements are JetBrains Mono per the S04 board: `[JetBrains Mono/12px/normal/$muted-foreground]` (left) and `[JetBrains Mono/12px/normal/$accent]` (right). The current `text-xs` Inter face is a gap that this promotion must fix. Once `--font-mono` is wired via `next/font` (design-tokens.md §1.3, P1-6), `font-mono` resolves to JetBrains Mono.

### Radius

- Track (step-paged): `rounded-full` (`--radius-full`, 9999px) — S04 board `r:999`.
- Track (question-paced): `rounded-sm` (`--radius-sm`, 6px) — S26 board `r:3`; design-tokens.md §3 says `r:3` "is bespoke geometry — keep inline (`r:3`), not a token." However `rounded-sm` (6px, `--radius-sm`) is the nearest token step, and the 3px board value is a static proxy for a track bar whose exact geometry is not brand-critical. If pixel-perfect fidelity is needed the consumer can pass `className="rounded-[3px]"`. The plan targets `rounded-sm` as the token-conformant default for `question-paced`.
- Fill bar: `rounded-full` in both variants (fill always caps as a pill within the track).

---

## Composition & deps — atoms/primitives + helpers

**No child components.** ProgressBar is a pure DOM atom (two nested `div`s + one or two `p`/`span` text elements).

Helper imports:
- `cn` from `@camp404/ui/lib/utils` — class merging for `className` prop passthrough and conditional `rounded-full` / `rounded-sm` on track.

No `@camp404/core` helpers needed — the only computation is the percent formula, which is trivial enough to inline.

No Radix primitive — a native `<div role="progressbar" ...>` is sufficient for a determinate progress bar.

---

## Absorbs — candidates replaced by this component

Per the merge map in `component-library.md`, ProgressBar is not a multi-candidate merge target (it is a single-source PROMOTE). It absorbs:

- **The private `ProgressBar` fn in `apps/web/components/questionnaire/wizard.tsx` (lines 263–278)** — that local declaration must be deleted once `packages/ui/src/components/progress-bar.tsx` is published and `QuestionnaireWizard` imports from `@camp404/ui`.
- Any future hand-rolled progress bar in new surfaces (BlockingTopBar in the questionnaire runner spec cites a `ProgressRow` with a track + fill + label — this component IS that ProgressRow).

No other named candidates from the 57-item inventory collapse into ProgressBar. The merge map carries no overlapping entries.

---

## Stories & tests

### Storybook stories (`progress-bar.stories.tsx` in `packages/ui/src/components/`)

| Story name | Props | Purpose |
|---|---|---|
| `StepPaged` | `current=2 total=12 showPercent labelMode="step"` | Canonical onboarding state — label row shows both mono text items |
| `StepPagedNoPercent` | `current=2 total=12 labelMode="step"` | Default (showPercent omitted) — only left label rendered |
| `QuestionPaced` | `current=3 total=8 labelMode="question"` | Blocking runner variant — "Question 3 of 8", no percent, rounded-sm track |
| `AtStart` | `current=1 total=11 showPercent labelMode="step"` | 9% fill |
| `AtEnd` | `current=11 total=11 showPercent labelMode="step"` | 100% fill |
| `SingleStep` | `current=1 total=1 showPercent labelMode="step"` | Edge: 100% fill from step 1 |

### Vitest / RTL tests (`progress-bar.test.tsx`)

| Test case | Assertion |
|---|---|
| Renders `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` | `getByRole('progressbar')` has the correct ARIA attributes |
| `current=3 total=8` → fill width `style="width: 38%"` (Math.round(3/8*100)=38) | `toHaveStyle({ width: '38%' })` |
| `current=1 total=1` → fill width 100% | clamped to 100 |
| `labelMode="step"` renders "Step 2 of 12" | `getByText('Step 2 of 12')` |
| `labelMode="question"` renders "Question 3 of 8" | `getByText('Question 3 of 8')` |
| `showPercent=true` renders the percent span with text "17%" for 2/12 | `getByText('17%')` present |
| `showPercent=false` (default) does NOT render percent element | `queryByText(/\d+%/)` is null |
| Fill div has `bg-primary` class | `toHaveClass('bg-primary')` |
| Track div has `bg-muted` class | `toHaveClass('bg-muted')` |
| `labelMode="step"` → track has `rounded-full`; `labelMode="question"` → track has `rounded-sm` | class assertions |
| `className` prop is forwarded to the root wrapper | custom class appears on container |

### A11y notes

- Root `<div>` receives `role="progressbar"`, `aria-valuenow={pct}`, `aria-valuemin={0}`, `aria-valuemax={100}`, and `aria-label` defaulting to `"${capitalised labelMode} ${current} of ${total}"` (e.g. `"Step 2 of 12"` or `"Question 3 of 8"`). This mirrors the visible label text for screen readers.
- The fill div is `aria-hidden="true"` — it is decorative; all progress information is carried by the ARIA attributes above.
- The label row `<p>` is `aria-hidden="true"` (the semantic progress value is on the `role="progressbar"` element; the text label is supplementary visual context, not additional semantic data).
- No `prefers-reduced-motion` override needed — `transition-[width]` is a CSS property transition on a non-essential decorative element; it is safe to leave active. If the project adds a global `motion-safe:` pattern, apply it here too.

---

## Build steps — ordered with acceptance criteria

**Prerequisite (unblocking, not owned by this plan):** `--font-mono` must be wired (`next/font/google` JetBrains_Mono → CSS variable, design-tokens.md §1.3). Until it is, use `font-mono` in class strings — Tailwind will fall back to `ui-monospace`; the shape is correct even if the brand face is missing. This plan does NOT own the font wiring.

1. **Create `packages/ui/src/components/progress-bar.tsx`**
   - Export `ProgressBarProps` interface and default `ProgressBar` function component.
   - Implement: root wrapper div (passes `className` via `cn`), label row (conditional on `labelMode`/`showPercent`), track div (conditional `rounded-full`/`rounded-sm` per `labelMode`), fill div.
   - Use only short-form token classes: `bg-muted`, `bg-primary`, `text-muted-foreground`, `text-accent`, `font-mono`.
   - Add ARIA attributes to root div.
   - Acceptance: component renders in isolation; all Storybook stories visible; no console errors.

2. **Export from `packages/ui/src/index.ts`** (or the package barrel)
   - Add `export { ProgressBar } from './components/progress-bar'` (and `export type { ProgressBarProps }`).
   - Acceptance: `import { ProgressBar } from '@camp404/ui'` resolves in consuming packages without type errors.

3. **Write `progress-bar.stories.tsx`**
   - Six stories listed above.
   - Acceptance: all stories render in Storybook; StepPaged shows two mono labels; QuestionPaced shows `rounded-sm` track; AtEnd shows full fill.

4. **Write `progress-bar.test.tsx`**
   - All test cases listed above using vitest + RTL.
   - Acceptance: `pnpm test` green for the new file; 100% of listed cases pass.

5. **Update `apps/web/components/questionnaire/wizard.tsx`**
   - Delete the private `ProgressBar` function (lines 263–278).
   - Import `ProgressBar` from `@camp404/ui`.
   - Replace the `<ProgressBar current={pageIndex + 1} total={questionnaire.pages.length} />` call with `<ProgressBar current={pageIndex + 1} total={questionnaire.pages.length} labelMode="step" showPercent />` (adopts the S04 ProgressLabelRow mono percent treatment per surface spec 04 §3 and Divergences item 7).
   - Fix the `bg-[color:var(--color-*)]` verbose token classes on the wizard's own error banner at the same time (cosmetic, same file, same P1-5 codemod batch).
   - Acceptance: onboarding wizard renders with the mono "Step N of M · NN%" label row; visual regression baseline updated.

6. **Wire ProgressBar into `BlockingTopBar` (app-local, spec surface 24)**
   - When `BlockingTopBar` is built (its own organism plan), it will import `ProgressBar` with `labelMode="question"` and `showPercent={false}` to render the "Question N of N" track per S26 board.
   - This step is a **future consumer wiring**; it is listed here for completeness and is owned by the BlockingTopBar plan. ProgressBar must be published (steps 1–4) before BlockingTopBar can use it.

---

## Consumers — molecules/organisms/surfaces that use ProgressBar

| Consumer | File | Usage | Props |
|---|---|---|---|
| `QuestionnaireWizard` | `apps/web/components/questionnaire/wizard.tsx` | Rendered at the top of the wizard form, reflects `pageIndex + 1` / `questionnaire.pages.length` | `labelMode="step"` · `showPercent` |
| `BlockingTopBar` (NEW organism) | `apps/web/` (app-local, to be built) | Embedded in the ProgressRow of the sticky header | `labelMode="question"` · no showPercent |
| `QuestionnaireWizard` replay variant | Same file, different props | my-forms replay — same wizard, same ProgressBar invocation | `labelMode="step"` · `showPercent` |

No molecules in `@camp404/ui` itself directly compose ProgressBar. The three consumers listed above are all application-layer organisms/surfaces that import it from the package.
