# BlockingTopBar — organism plan

- **mapsTo:** **NEW** (app-local; reusable across blocking questionnaire runners — burner / dietary / agreements). Not a `@camp404/ui` reusable.
- **Home:** `apps/web` — per `component-library.md §BlockingTopBar` (`mapsTo: NEW (app-local; reusable across blocking runners)`) and surface brief 24 (`BlockingTopBar (sticky chrome) — NEW component`). It composes app-resident renderers and reaches the runner's `firstStepSignOut`/page-state, so it is not a presentation primitive that belongs in `@camp404/ui`.
- **Target file:** `apps/web/components/questionnaire/blocking-top-bar.tsx` (new file, sibling of `wizard.tsx`). A `"use client"` component.

---

## Current state — what exists today (the old design's component/route markup)

There is **no `BlockingTopBar` anywhere in the codebase.** Confirmed by `grep -rn "BlockingTopBar\|RequiredChip\|BlockingNotice" apps packages` → zero matches. The blocking runner *chrome* (the whole reason this organism exists) is not built — the route renders the plain onboarding wizard, not the S26 blocking presentation.

What exists today is the **un-chromed wizard host** that this organism redesigns the top of:

- **Route / server component:** `apps/web/app/onboarding/questionnaire/page.tsx` (`force-dynamic`). Server-resolves auth (`getAuthenticatedUserOrRedirect`), camp access (`ensureCampUser` + `hasCampAccess` → `/signup/required`), `getBurnerProfile` (→ redirect `/` if `completedAt`), and `getIdDocuments`; merges the decrypted `id.number` back into the pre-fill (`mergeIdNumber`) and mounts `<QuestionnaireWizard … firstStepSignOut />`. Its current header (lines 43–50) is a static `<header>` with a hard-coded `<h1>Build your burner profile</h1>` + subtitle — **this is the markup BlockingTopBar replaces** with the S26 sticky `$card` chrome (title + RequiredChip + Sign out + ProgressRow).
- **Progress UI (today):** a private, unexported `ProgressBar` function inside `apps/web/components/questionnaire/wizard.tsx` (lines 263–278) rendering an `h-1.5 rounded-full bg-[…muted]` track + `bg-[…primary]` fill (`width: pct%`) and a single `text-xs` line **"Step {current} of {total}"**. It is mounted at `wizard.tsx:187` as the first child of the wizard `<form>`. Off-token verbose colour classes; Inter (not mono); page-indexed "Step", not "Question".
- **Sign-out escape (today):** lives **inside the wizard footer**, not a top bar — `wizard.tsx:239–244`, a `<Button variant="ghost" asChild><a href="/auth/sign-out">Sign out</a></Button>` shown only on `pageIndex === 0` when `firstStepSignOut` is true.
- **Title source (today):** the static `<h1>` in `page.tsx:45`. The dynamic source the redesign should use is `required_actions.title` / `questionnaire_activations.title` (surface 24 §1; service plan 03 — the row that mounts the surface).
- **`required_actions` registry:** `apps/web/lib/required-actions.ts` (`ACTION_ROUTES` maps `burner_profile → /onboarding/questionnaire`; `nextGate` is the gating spine helper). The runner chrome is the shared template for every key in this registry.

No `RequiredChip` and no `BlockingNotice` exist — both are board-only (surface 24 §1–§2). RequiredChip is absorbed by the NEW `Badge` atom; BlockingNotice by the PROMOTE `Alert` molecule (see Composition).

---

## Composition — leaves consumed, core helpers, services, server/client split

**Server-component vs `"use client"` split:**

BlockingTopBar is a **`"use client"` presentational organism**. It renders sticky chrome, reads no data and performs no I/O of its own — it receives everything via props. It is mounted by the runner's **client** subtree (it must sit in the same client island as `QuestionnaireWizard` so `current`/`total` track the wizard's `pageIndex` reactively). The **server component** (`page.tsx`, `force-dynamic`) is what fetches the data and passes the resolved `title` down; BlockingTopBar itself is never a server component.

> Wiring note: today `QuestionnaireWizard` owns `pageIndex` internally and renders its own (private) progress at `wizard.tsx:187`. To drive a *sticky* top-bar progress that lives **above** the scrolling wizard body, the runner needs `current`/`total` lifted to the runner shell. Recommended: a thin app-local `QuestionnaireRunner` client wrapper that owns `pageIndex` (or receives an `onStepChange`/controlled `pageIndex` from the wizard) and renders `<BlockingTopBar …>` + `<Alert persistent>` + `<QuestionnaireWizard …>`. BlockingTopBar stays dumb. The exact lift mechanism (callback vs controlled prop on the wizard) is a build reconciliation, below.

**Leaf components it consumes:**

| Leaf | Plan file | Usage in BlockingTopBar |
|---|---|---|
| `ProgressBar` (PROMOTE → `@camp404/ui`) | [`atom-progressbar.md`](./atom-progressbar.md) | The `ProgressRow` track + fill + label. Invoked `labelMode="question"` + `showPercent={false}` per S26 ("Question N of N", no percent, `rounded-sm` track). The ProgressBar plan's Build step 6 / Consumers table explicitly names BlockingTopBar as its question-paced consumer. |
| `Badge` (NEW → `@camp404/ui`) | [`atom-badge.md`](./atom-badge.md) | The **RequiredChip** — `tone="destructive" variant="soft-tint" icon={Lock}` with label "Required". The Badge plan absorbs `RequiredChip` (Badge §Absorbs row "RequiredChip" + Consumers row "BlockingTopBar (NEW, app-local) — RequiredChip in runner header"). Board draws `fill:$muted stroke:$border` + lock; the canonical chip tone is reconciled to the Badge component's RequiredChip token mapping (see Tokens reconciliation in surface 24 §Divergences — destructive-tint family). |
| `Button` (REUSE `@camp404/ui`) | [`atom-button.md`](./atom-button.md) | The **Sign out** affordance, rendered `variant="link"` (or `ghost size="sm"`) `asChild` wrapping `<a href="/auth/sign-out">`. Board draws it as a plain accent text link (Inter/13/500/`$accent`); Button `variant="link"` (`text-primary`) is the closest token primitive — confirm accent vs primary in the link-tone reconciliation below. Button plan Consumers already lists `wizard.tsx` Sign-out usage. |

**Sibling chrome (NOT inside BlockingTopBar, but mounted directly beneath it by the runner shell):**

- `BlockingNotice` = `Alert` molecule, `tone="destructive" persistent` ([`molecule-alert.md`](./molecule-alert.md), §Build step 7 / Consumers "QuestionnaireRunner — Destructive + persistent — BlockingNotice"). BlockingTopBar does **not** own it — the persistent red banner is a separate sticky band so the two can be styled/positioned independently. Documented here because the surface's sticky chrome stack is `BlockingTopBar` **+** `BlockingNotice` (surface 24 §1–§2).

**`@camp404/core` helpers:** **none.** BlockingTopBar is pure presentation — no rank/clearance check (the runner is rank-agnostic, surface 24 §States "Preview-but-locked … does NOT apply"), no validation, no business logic. The percent math lives inside `ProgressBar`. (Per architecture.md the `core` package is for pure logic; this organism has none.)

**Services / server-actions it calls:** **none directly.** BlockingTopBar's only "action" is the Sign-out link, a plain navigation to the route `/auth/sign-out` (no server action, no confirmation — surface 24 §User actions). The data flow it participates in:

- **`title`** is sourced server-side from `required_actions.title` / `questionnaire_activations.title` (service plan 03; schema `required_actions.title` drives the BlockingTopBar title per surface 24 §Data). The runner shell receives it and passes it as a prop.
- The runner's **submit/save** path (`saveBurnerProfile(rawResponses, final)` in `apps/web/app/onboarding/questionnaire/actions.ts`, which validates → splits PII → `upsertBurnerProfile` → `satisfyBurnerProfileAction` → `redirect("/")`; service plan 03 §Target API) is owned by `QuestionnaireWizard`, **not** BlockingTopBar. The top bar only reflects progress; it never calls the action.

---

## API & data flow — props/inputs, fetched vs received, state flow

BlockingTopBar **fetches nothing and receives everything.** All inputs are props passed by the client runner shell (which got `title` from the server component).

```ts
export interface BlockingTopBarProps {
  /**
   * Questionnaire title shown in TitleRow (Inter/17/600/$foreground).
   * Sourced server-side from required_actions.title /
   * questionnaire_activations.title; passed down as a string. Defaults to the
   * questionnaire's display name if the row carries no title.
   */
  title: string;
  /** Current question index (1-based) — drives ProgressBar + label. */
  current: number;
  /** Total questions — drives ProgressBar denominator. */
  total: number;
  /**
   * Sign-out destination. Default "/auth/sign-out". Exposed so future
   * blocking runners can override the escape route if needed.
   */
  signOutHref?: string;
  /** Optional className for the sticky root (host controls width). */
  className?: string;
}
```

**No form, no action, no validation lives in this component.** It is read-only chrome. There is no `onSignOut` callback — Sign out is a real `<a href>` navigation (matches today's `wizard.tsx:243` and surface 24's "plain `<a href="/auth/sign-out">`").

**State flow:**

- `current`/`total` are **controlled** — they reflect the wizard's `pageIndex + 1` and the question count. BlockingTopBar holds no internal state; when the wizard advances, the parent re-renders BlockingTopBar with a new `current`, and `ProgressBar` re-renders the fill width. This is the only reactive input.
- Because S26 is **question-paced** ("Question N of N", one question per card), `total` is the question count for the active questionnaire (vs the wizard's page-indexed "Step N of M"). The fill *math* is identical; only the label word + denominator framing differ (surface 24 §Divergences "Live progress reads 'Step N of M' … Board reads 'Question N of N' … Board wins"). Reconcile `current`/`total` to question-paced counts at the runner-shell boundary; BlockingTopBar just renders what it's handed.

---

## States — full matrix incl. global gating

BlockingTopBar is sticky chrome with no async behaviour of its own; its states are driven by the props it's handed and by the surface's gating context.

| State | Presentation |
|---|---|
| **Default (sticky)** | `vertical w:fill_container gap:14 pad:[16,20] fill:$card stroke:$border`, `position: sticky; top: 0; z-`above-body. TitleRow (title + RequiredChip + Sign out) over ProgressRow (label + track+fill). Stays pinned while the body scrolls (surface 24 §1). |
| **Progress reflects step** | `ProgressBar current/total` → fill width `Math.round(current/total*100)%`; label "Question {current} of {total}". At question 1: ~`1/total` fill; at last: full fill. |
| **Empty / loading (route mount)** | No client skeleton — the **server component** (`force-dynamic`) resolves auth + access + `getBurnerProfile` + `getIdDocuments` before render (surface 24 §States "Loading (route mount)"). BlockingTopBar is not rendered until `title`/`current`/`total` are available, so it has no independent loading state. (`title` is always present by mount time.) |
| **Error** | BlockingTopBar has **no error state of its own**. Save-failure (`saveBurnerProfile` throws) surfaces as the wizard's `_form` Alert banner *inside the body*, not the top bar (surface 24 §User actions "Save action throws"). The persistent `BlockingNotice` (sibling Alert, not this component) is always present regardless. |
| **Submitting** | BlockingTopBar is **inert during submit** — it does not disable or change. While the wizard's `isPending` is true (primary button → "Submitting…", Back disabled), the top bar keeps showing the same progress/title; Sign out stays available (it's an escape hatch). No spinner in the bar. |
| **Success** | No in-bar success state. On final submit the action **redirects** out of the runner (`redirect("/")`); BlockingTopBar unmounts with the route. The post-submit success/queue UI is the separate S27 surface (surface 24 §States "Success"). |
| **Disabled** | Nothing in BlockingTopBar is independently disabled. The Sign-out link is never disabled (escape hatch, surface 23 §User actions). Back-on-first-question disabling is a **footer** concern owned by the wizard, not the bar — the bar's Sign out *is* the first-step escape (surface 24 §1, §Open questions #9, mirroring `firstStepSignOut`). |
| **Preview-but-locked / rank gating** | **N/A — does not apply.** The runner is identity-only and rank-agnostic; it never renders captain/rank previews and has no `CaptainLock` variant (surface 24 §States "Not-applicable gating states", "Preview-but-locked (decision #3): does NOT apply"). BlockingTopBar carries **no** `requireClearance`/rank logic. |
| **Global gating matrix (why the surface mounts)** | This surface IS a gate. It mounts only because the user has a pending **blocking** `required_action` (`type='questionnaire'`). Gating order (`app/page.tsx`): unauth → Landing; no invite → `/signup/required`; **pending blocking required-action → this runner**; not approved → `/pending-approval`. So BlockingTopBar's chrome appears strictly *between* the invite gate and the approval gate. If no pending blocking action maps to a route, the user is never routed here (surface 24 §States "Gating context" + "Empty queue"). |
| **Already-complete re-entry** | If `burner_profiles.completedAt` is set the server redirects to `/` before render — BlockingTopBar never paints. A re-activated newer `required_actions.version` re-opens the gate (surface 24 §Validation "Already-complete"). |

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Dependency prerequisites (must land before BlockingTopBar):**

1. **Phase 0 foundations** (`foundations-tokens.md`): status tokens + `--font-mono` (JetBrains Mono via `next/font`) + radius scale. RequiredChip's destructive tint and the mono progress label depend on these.
2. **`ProgressBar`** published to `@camp404/ui` (atom-progressbar.md steps 1–4) — BlockingTopBar imports it. ProgressBar must support `labelMode="question"` + `showPercent={false}`.
3. **`Badge`** published to `@camp404/ui` (atom-badge.md, incl. status tokens from Phase 0) — for RequiredChip (`tone="destructive" variant="soft-tint" icon={Lock}`).
4. **`Alert`** published to `@camp404/ui` (molecule-alert.md, `persistent` variant) — for the sibling BlockingNotice the runner shell mounts beneath this bar.
5. **`Button`** (REUSE, already in `@camp404/ui`; radius/weight EXTENDs from atom-button.md are independent and non-blocking).

**Ordered steps:**

1. **Create `apps/web/components/questionnaire/blocking-top-bar.tsx`** (`"use client"`).
   - Implement `BlockingTopBarProps` + the `BlockingTopBar` component: sticky root (`sticky top-0 z-…`, `bg-card border-b border-border px-5 py-4 flex flex-col gap-3.5`), TitleRow (`flex items-center gap-…`: `<h1 className="text-[17px] font-semibold text-foreground">{title}</h1>` + `<Badge tone="destructive" variant="soft-tint" icon={Lock}>Required</Badge>` + a right-aligned Sign-out `<Button variant="link" asChild><a href={signOutHref}>Sign out</a></Button>`), ProgressRow (`<ProgressBar current={current} total={total} labelMode="question" />`).
   - Use only short-form token classes; no raw hex, no verbose `[color:var(--color-*)]`.
   - **Acceptance:** renders in isolation given `title/current/total`; sticky positioning verified; no console errors; RequiredChip + Sign out + progress all present.

2. **Add the runner shell that lifts `pageIndex`** (app-local, e.g. `apps/web/components/questionnaire/runner.tsx` or extend the wizard with a controlled `pageIndex`/`onStepChange`).
   - The shell mounts `<BlockingTopBar title current total on…>` (sticky), `<Alert tone="destructive" persistent>You can't use the app until this is finished.</Alert>` (sticky, beneath the bar), then `<QuestionnaireWizard …>` (scrolling body). Reconcile how `current`/`total` are derived (question-paced) and how the wizard publishes its step (controlled prop vs callback) — see reconciliations.
   - **Acceptance:** advancing the wizard updates the sticky ProgressBar; the BlockingNotice stays pinned and never dismisses; the wizard's own private ProgressBar (`wizard.tsx:187, 263–278`) is removed/relocated so progress isn't drawn twice.

3. **Wire the blocking variant into `apps/web/app/onboarding/questionnaire/page.tsx`.**
   - Replace the static `<header><h1>Build your burner profile</h1>…</header>` (lines 43–50) with the runner shell, passing `title` resolved from `required_actions.title` / `questionnaire_activations.title` (fall back to the questionnaire display name). Keep `firstStepSignOut` semantics (the bar's Sign out is the escape; footer Back stays disabled on Q1 per surface 24 §Open questions #9).
   - **Acceptance:** the route renders the S26 blocking chrome (sticky title + Required + Sign out + question-paced progress + persistent red notice) over the existing field machine; all 10 field kinds still render; submit still redirects on completion.

4. **Stories + tests.**
   - **Tests (`blocking-top-bar.test.tsx`, RTL):**
     - renders the `title` text;
     - renders the "Required" RequiredChip (Badge present, lock icon `aria-hidden`);
     - renders a Sign-out link with `href="/auth/sign-out"` (and override via `signOutHref`);
     - renders ProgressBar with `labelMode="question"` → "Question {current} of {total}" and correct fill width for `current/total`;
     - root has sticky positioning class;
     - no percent label is rendered (showPercent omitted);
     - `className` forwarded to root.
   - **Story (`blocking-top-bar.stories.tsx`, if app-local stories are supported, else a wizard-runner story):** `Default` (Q3 of 8), `FirstQuestion` (1 of 8), `LastQuestion` (8 of 8), `LongTitle` (wrap behaviour).
   - **Acceptance:** all tests green; stories render the sticky chrome with no console errors.

5. **Accessibility pass.**
   - `<h1>`/heading is the title (single per surface); RequiredChip icon `aria-hidden`; ProgressBar carries `role="progressbar"` + `aria-valuenow/min/max` (owned by the ProgressBar atom); Sign-out is a real focusable `<a>`; the sibling BlockingNotice Alert is `role="alert"` (mounts into stable DOM so it announces). Sticky chrome must not trap focus.
   - **Acceptance:** keyboard tab reaches Sign out; screen reader announces progress + the blocking notice.

---

## Build reconciliations (carry as decisions, do not silently resolve)

- **Sign-out link tone:** board draws Inter/13/500/`$accent`; Button `variant="link"` resolves `text-primary`. Confirm accent vs primary — recommend `variant="link"` with an accent override class, or add an `accent` link treatment (surface 24 §1 vs Button plan tokens).
- **RequiredChip tone:** board chip fill is `$muted stroke:$border` (neutral); the Badge plan maps RequiredChip to `tone="destructive" variant="soft-tint"`. Pick one — recommend the Badge plan's destructive treatment to read as "blocking", but flag that the board drew neutral.
- **Progress lift mechanism:** controlled `pageIndex` on `QuestionnaireWizard` vs an `onStepChange` callback feeding the shell. Either keeps BlockingTopBar dumb; pick at build time (architecture-neutral). The wizard's private `ProgressBar` (`wizard.tsx:263–278`) must be removed once the sticky bar owns progress, so it isn't rendered twice.
- **Question-paced counts:** `current`/`total` are question-indexed (S26) vs the wizard's page-indexed steps. Derive question-paced counts at the shell boundary (surface 24 §Divergences "Question N of N").
- **`ProgressBar` token-conformance:** S26 draws `ProgressTrack h:6 r:3`; the ProgressBar atom targets `rounded-sm` for `question` mode (atom-progressbar.md §Tokens). Acceptable proxy; pixel-perfect `rounded-[3px]` available via className if design insists.

---

## Consumers — which surfaces mount it

| Surface | File | How |
|---|---|---|
| **24 · Questionnaire runner (blocking)** | `apps/web/app/onboarding/questionnaire/page.tsx` → runner shell | Primary consumer. Mounts BlockingTopBar as sticky chrome over the shared field machine for the `burner_profile` blocking `required_action` (surface 24 §1, §Components used). |
| **Future blocking runners (dietary / agreements / driver)** | future `ACTION_ROUTES` entries (`apps/web/lib/required-actions.ts`) | Same chrome template — BlockingTopBar is explicitly "reusable across all blocking questionnaire runners (burner / dietary / agreements)" (component-library §BlockingTopBar; surface 24 §Components used "Reusable across all blocking questionnaire runners"). Each new key reuses this organism unchanged. |

Not used by surface 23 (Questionnaire gate / S25) — that interstitial is pre-wizard, has **no** ProgressBar/blocking chrome, and uses its own `QCard` (surface 23 §Layout). BlockingTopBar belongs to the runner (S26), not the gate (S25).

No functionality dropped: the title, the Required signal, the Sign-out escape hatch, and the question-paced progress all carry forward; the old static `<header>` + private page-indexed `ProgressBar` are absorbed into this organism + the PROMOTEd `ProgressBar`/`Badge`/`Alert` leaves; the persistent BlockingNotice is mounted as a sibling Alert by the runner shell.
