# ReportBugDialog — organism plan

- **mapsTo + home:** **REUSE/EXTEND** (keep the existing app-local component) over
  `@camp404/ui/components/dialog.tsx`. Per `component-library.md` §ReportBugDialog:
  "keep `ReportBugDialog` (app) over `@camp404/ui/dialog.tsx`". It is a member-level
  global overlay (S25); it stays **app-local** because it imports the `"use server"`
  feedback action, the app-resident `RecorderPanel`, and reads `window.location`.
- **Target file:** `apps/web/components/feedback/report-bug-dialog.tsx` (exists; EXTEND in place).
- **Sibling (unchanged home, REUSE):** `apps/web/app/feedback-gate.tsx` — the headless
  `FeedbackGate` shake wrapper that mounts this dialog. Stays app-local.

---

## Current state — what exists today (the old design's component/route markup)

The dialog **already exists and ships** — this is a REUSE/EXTEND, not a NEW build. Confirmed by reading the files.

- **`apps/web/components/feedback/report-bug-dialog.tsx`** (the organism, 283 lines).
  `"use client"`. Renders `Dialog`/`DialogContent` (`max-h-[90vh] max-w-lg overflow-y-auto`)
  with two branches keyed off local `result` state:
  - **Form branch:** `DialogHeader` with kind-dependent title ("Report a bug" / "Request a
    feature") + fixed description ("This opens a GitHub issue on our public tracker — please
    don't include personal details."); a hand-rolled **kind toggle** (`role="group"
    aria-label="Report type"`, two `Button`s — `Bug` icon / `Lightbulb` icon — selected =
    `variant="default"`, other = `variant="outline"`, `aria-pressed` reflects selection);
    `Label` + `Textarea` (`rows={6}`, `maxLength={DESCRIPTION_MAX}`, kind-dependent
    label/placeholder); a **"Dictate instead"** inline `Button variant="outline" size="sm"`
    (`Mic` icon, lines 222–232) that swaps in `RecorderPanel`; an **"Improve with AI"**
    `Checkbox`+`Label` card rendered only when `aiAvailable` (default-checked); an inline
    error `<p role="alert">` (destructive-tinted, lines 255–262); `DialogFooter` with
    **Cancel** (`variant="outline"`, disabled while pending) + **Send report** (`Loader2`
    spinner + "Sending…" while pending; disabled until trimmed-non-empty).
  - **Success branch:** `DialogHeader` `CheckCircle2` + "Report filed" + number-dependent
    body; an `<a target="_blank">` (`ExternalLink`) to `result.url`; **Done** button.
  - State: `kind`, `description`, `dictating`, `dictated`, `useAi`, `error`, `result`,
    `useTransition` `isPending`. `useEffect` resets all on each closed→open transition.
    `appendTranscript` trims/ignores-empty/`setDictated(true)`/newline-joins/re-clamps to
    `DESCRIPTION_MAX`. The `onOpenChange` wrapper **blocks dismissal mid-send**
    (`if (!next && isPending) return;`). `handleSubmit` calls `submitFeedbackAction` inside
    the transition, threads `route: window.location.pathname`, forces `useAi: aiAvailable && useAi`,
    and catches transport rejection → "Couldn't send your report just now."
- **`apps/web/app/feedback-gate.tsx`** (`FeedbackGate`, REUSE). `"use client"`. Reads
  `authClient.useSession()`; `signedIn = !isPending && !!session`. `useShakeGesture({ enabled:
  signedIn && !open, onShake: () => setOpen(true) })`. Requests iOS motion permission once on
  first pointer gesture after sign-in. Renders `null` until signed in, else `<ReportBugDialog
  open onOpenChange aiAvailable>`. Mounted once in `apps/web/app/layout.tsx:55`
  (`<FeedbackGate aiAvailable={!!process.env.ANTHROPIC_API_KEY} />`).
- **`apps/web/app/feedback/actions.ts`** — `"use server"` `submitFeedbackAction(input)` →
  `FeedbackResult`. Auth gate → burst `{limit:3}` + daily `{limit:20, windowMs:86_400_000}`
  rate-limit → `InputSchema` Zod → single `sanitizeReportText` (reject empty-after-sanitize)
  → opaque `reporterRef` (`findCampUserByAuthId(user.id)?.id || "unlinked"`) → E2E short-circuit
  (`{ok:true, number:0, url:".../issues"}`) → optional `structureWithAi` → `buildFeedbackIssue`
  → GitHub `fetch` (`AbortSignal.timeout(8000)`, 201 → `GithubIssueSchema`, 401/403/404/410/
  default status mapping). REUSE/EXTEND.
- **`apps/web/lib/github-feedback.ts`** — PURE. Exports `FeedbackKind = "bug"|"feature"`,
  `DESCRIPTION_MAX = 5000`, `labelsFor`, `redactPii`, `sanitizeReportText`, `buildFeedbackIssue`,
  `StructuredReport`/`BuildIssueInput`/`BuiltIssue`. Already unit-tested; targeted for
  extraction to `packages/core/feedback` (architecture §Hybrid extraction, plan 09).
- **`apps/web/components/feedback/use-shake-gesture.ts`** — `createShakeDetector` (pure
  state machine) + `useShakeGesture`/`motionPermissionNeeded`/`requestMotionPermission` hooks.
- **`apps/web/components/voice/recorder-panel.tsx`** — the embedded voice primitive (mounted
  when `dictating`, no `promptKey`). Stays app-local (PROMOTE/EXTEND per its own leaf plan).
- **Tests today:** `apps/web/components/feedback/__tests__/report-bug-dialog.test.tsx`
  (transport-reject error, `{ok:false}` error, AI-toggle visibility, success-state link),
  plus `use-shake-gesture.test.ts`, `lib/__tests__/github-feedback.test.ts`,
  `app/feedback/actions.test.ts`.

**Net:** the functionality is complete and shipping. This plan **drops nothing** — it
re-points pure imports to `@camp404/core`, swaps two hand-rolled patterns onto promoted
`@camp404/ui` components (kind toggle → `SegmentedControl`, "Dictate instead" → `DictatePill`,
error `<p>` → `Alert`), and applies the Phase-0 token codemods. Board reconciliations
(S25 §Divergences 3 & 5): the board's "Attach a screenshot" checkbox stays **DROPPED** (no
code backing, no diagnostics capture); voice stays (decision 5, field-level dictation).

---

## Composition — leaves, core helpers, services; server/client split

### Server vs client split
- **`ReportBugDialog` is fully `"use client"`** — it holds local form state, a `useTransition`,
  and reads `window.location.pathname`. There is **no server component** for this organism.
- **`FeedbackGate` is `"use client"`** — needs the live `authClient.useSession()` and the
  shake/devicemotion listeners.
- **`aiAvailable` is the only server→client input**, computed once in the root **server**
  layout (`!!process.env.ANTHROPIC_API_KEY`) and passed through `FeedbackGate` as a plain prop.

### Leaf components it consumes (link plan files)
- **`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`**
  — `@camp404/ui/components/dialog.tsx` (REUSE primitive; not a leaf-plan target).
- **`Button`** — `@camp404/ui/components/button.tsx` (REUSE). Used for Cancel / Send / Done
  and, until the SegmentedControl swap lands, the kind-toggle buttons.
- **`Textarea`** — `@camp404/ui/components/textarea.tsx` (REUSE) → see
  [`atom-textarea.md`](./atom-textarea.md).
- **`Checkbox`** — `@camp404/ui/components/checkbox.tsx` (REUSE) → see
  [`atom-checkbox.md`](./atom-checkbox.md). The AI toggle.
- **`Label`** — `@camp404/ui/components/label.tsx` (REUSE) → see [`atom-label.md`](./atom-label.md).
- **`SegmentedControl`** (PROMOTE, NEW in `@camp404/ui`) → see
  [`molecule-segmentedcontrol.md`](./molecule-segmentedcontrol.md). The **kind toggle** becomes
  a 2-cell SegmentedControl (Bug / Feature) once it lands — replaces the hand-rolled
  `role="group"` two-button row. (Until then the existing buttons stay; behaviour-equivalent.)
- **`DictatePill`** (PROMOTE, NEW in `@camp404/ui`) → see
  [`molecule-dictatepill.md`](./molecule-dictatepill.md). The "Dictate instead" trigger becomes
  the shared pill (`r:999`). DictatePill's own plan names `report-bug-dialog.tsx` as a wire-up
  consumer.
- **`Alert`** (PROMOTE, NEW in `@camp404/ui`) → see [`molecule-alert.md`](./molecule-alert.md).
  The inline error `<p role="alert">` becomes an `Alert variant="destructive"`. Alert's plan
  lists `report-bug-dialog.tsx:255–262` as a duplicated consumer to fold in.
- **`RecorderPanel`** (PROMOTE/EXTEND, stays app-local) → see
  [`molecule-recorderpanel.md`](./molecule-recorderpanel.md). Mounted while `dictating`,
  invoked **without** `promptKey` (generic transcription); `onTranscript`/`onDismiss`.
- **lucide icons:** `Bug`, `Lightbulb`, `Mic` (folds into DictatePill), `CheckCircle2`,
  `ExternalLink`, `Loader2`.

### `@camp404/core` helpers (pure)
- **`DESCRIPTION_MAX`, `FeedbackKind`, `sanitizeReportText`** — currently imported from
  `@/lib/github-feedback`; after Phase-3 extraction these resolve from **`@camp404/core`
  (feedback module)** (architecture §Hybrid extraction, plan 09). The dialog imports only the
  pure pieces it needs (`DESCRIPTION_MAX` for the `maxLength`/clamp, `FeedbackKind` for the prop
  type). A thin re-export shim from `@/lib/github-feedback` may persist to minimise churn.
- The dialog needs **no other core logic** — `redactPii`/`labelsFor`/`buildFeedbackIssue` run
  server-side inside the action, not in the client component.

### Services / server-actions it calls (named from service-plan 09)
- **`submitFeedbackAction(input)`** (`apps/web/app/feedback/actions.ts`, `"use server"`,
  REUSE/EXTEND) — the only server call. Returns `FeedbackResult`. Service-plan-09 §Build step 2
  re-points its pure imports to core; orchestration (auth/limits/sanitize/AI/GitHub) unchanged.
- **`structureWithAi`** (`apps/web/lib/feedback-ai.ts`, `server-only`) — invoked **by the
  action**, not the dialog; fail-safe → `null`. The dialog only influences it via the `useAi`
  flag in the payload.
- Writes to **no Camp 404 table** — GitHub Issues is the store (S25 §Data).

---

## API & data flow — props/inputs, fetch vs receive, state flow

### Props (per `component-library.md` + live signature)
```ts
interface ReportBugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: FeedbackKind;   // default "bug"
  aiAvailable?: boolean;        // default false; gates the AI checkbox
}
```
All inputs are **received via props** — the dialog **fetches nothing on mount** and self-fetches
no data. `aiAvailable` originates from the server layout's env read; `open`/`onOpenChange` are
owned by `FeedbackGate` (or, future, the error boundary "Report" entry — S25 OQ).

### Local state (client)
`kind`, `description`, `dictating`, `dictated`, `useAi`, `error: string|null`,
`result: Extract<FeedbackResult,{ok:true}>|null`, `isPending` (transition). Reset on every
closed→open transition via `useEffect([open, defaultKind])`.

### Form action + validation
- **Submit:** `handleSubmit` → `startTransition` → `submitFeedbackAction({ kind, description,
  dictated, useAi: aiAvailable && useAi, route: window.location.pathname })`.
- **Client-side gate:** Send disabled until `description.trim().length > 0 && !isPending`
  (`canSubmit`); `Textarea maxLength={DESCRIPTION_MAX}`.
- **Server-side validation (authoritative):** `InputSchema` Zod (`min(1, "Please describe the
  issue.")`, `max(DESCRIPTION_MAX)`), then `sanitizeReportText` rejects empty-after-PII/HTML-strip
  with the same message. The dialog renders the **first returned `{ok:false}.error`** verbatim in
  the Alert.
- **Result handling:** `res.ok` → `setResult(res)` (swap to success branch); else
  `setError(res.error)`. Transport rejection (network/runtime) → caught → generic retry message.
- **Dictation flow:** `RecorderPanel.onTranscript` → `appendTranscript` (trim, ignore empty,
  `setDictated(true)`, newline-join unless prev ends in whitespace, clamp to `DESCRIPTION_MAX`);
  panel stays open for another recording until `onDismiss`.

---

## States — full matrix incl. global gating

- **Empty** — opens with empty description; Send disabled. (S25: "description starts empty;
  Send disabled.") If queue-less / unauthenticated, `FeedbackGate` renders `null` and the dialog
  never mounts.
- **Loading (mount)** — none; nothing is fetched. `FeedbackGate` treats `useSession()`
  `isPending` as not-signed-in → renders nothing (no spinner).
- **Populated (form)** — full form: kind toggle, description, DictatePill (or RecorderPanel
  when dictating), AI card (if `aiAvailable`).
- **Submitting (locked)** — Send shows `Loader2` + "Sending…"; Cancel disabled; **dialog cannot
  be dismissed by Escape / outside-click / X** (`onOpenChange` wrapper guards on `isPending`).
- **Success** — success branch: `CheckCircle2` "Report filed" + `Issue #{number}` body (or
  "Thanks — your report was sent." when `number ≤ 0`) + `View issue #{number}` link (or "Open
  the tracker") + **Done**. E2E mode returns `number:0` → renders the `≤ 0` copy.
- **Error (inline)** — `Alert variant="destructive"` (`role="alert"`) with the typed error.
  Covers: validation ("Please describe the issue."), rate-limit (burst/daily messages), auth
  ("Please sign in to send feedback."), GitHub config (missing token / misconfigured repo),
  GitHub status (401/403/404/410), timeout/network, and transport reject. Form stays editable →
  user can retry.
- **Disabled** — Send disabled when empty-trimmed or pending; Cancel disabled while pending;
  RecorderPanel controls disabled while recording/busy (its own plan); **AI checkbox absent
  (not disabled)** when `!aiAvailable`.
- **AI-unavailable** — `aiAvailable=false` ⇒ checkbox not rendered; `useAi` forced `false` in
  the payload (`aiAvailable && useAi`).
- **Validation-error** — first Zod message surfaced; `maxLength` enforced client-side; empty-
  after-sanitize rejected server-side.

### Global matrix / gating (S25 §Gating states)
- **Invite-gated / pre-invite** — works for a signed-in user with **no camp row**; the action
  uses the `"unlinked"` `reporterRef` sentinel. Dialog UI is identical.
- **Onboarding-incomplete** — a member mid-onboarding can still shake-and-file (the routed S25
  gate, not this overlay, handles the incomplete-profile redirect).
- **Pending / rejected approval** — not gated here; `FeedbackGate` self-gates only on
  auth/session (the action also auth-gates as defence in depth).
- **Preview-but-locked / CaptainLock** — **N/A.** All five S25 overlays are member-level; there
  is **no captain-only data** and **no rank gating** on this surface. CaptainLock is explicitly
  noted as *not* used here (S25 §Components, §Gating). No `requireClearance`, no inert preview.
- **E2E-test mode** — action short-circuits to `{ok:true, number:0, url:".../issues"}` (no AI /
  no GitHub); dialog renders the `number ≤ 0` success copy.

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Prerequisites (must land first):**
- **Phase 0 — foundations tokens/fonts** (`foundations-tokens.md`): status tokens
  (`destructive` tint, `success`/`info` for the success affordance), radius scale, `--text-*`.
  Gates the token codemod and the Alert/SegmentedControl/DictatePill visuals.
- **Phase 3 — `@camp404/core` feedback extraction** (architecture §Hybrid, plan 09 build-step 2):
  `github-feedback.ts` (incl. `DESCRIPTION_MAX`, `FeedbackKind`, `sanitizeReportText`) moves to
  `packages/core/feedback`; `submitFeedbackAction`'s imports re-pointed; optional re-export shim.
- **Phase 5 — `@camp404/ui` PROMOTE leaves:** `SegmentedControl`, `DictatePill`, `Alert` land in
  `@camp404/ui` (their leaf plans). `RecorderPanel` token/state EXTEND (its plan) ships in parallel.

**Steps:**
1. **Re-point pure imports.** Change `import { DESCRIPTION_MAX, type FeedbackKind } from
   "@/lib/github-feedback"` to `@camp404/core` (or keep via shim). No behaviour change.
   *Acceptance:* dialog compiles; existing `report-bug-dialog.test.tsx` green unchanged.
2. **Token codemod (P1-5).** Replace verbose `[color:var(--color-*)]` syntax (success title
   colour, link colour, AI-card border, error tint) with short-form tokens
   (`text-primary`/`border-border`/`text-muted-foreground`/`text-destructive`). *Acceptance:*
   no visual regression; tokens resolve from Phase-0 `globals.css`.
3. **Kind toggle → `SegmentedControl`.** Replace the hand-rolled `role="group"` two-button row
   with a 2-cell `SegmentedControl` (Bug / Feature, icons retained). Preserve `aria-label="Report
   type"`, selection semantics, and `defaultKind`. *Acceptance:* selecting a cell flips
   title/label/placeholder; selected cell reflects current `kind`.
4. **"Dictate instead" → `DictatePill`.** Swap the inline outline `Button` (lines 222–232) for
   `DictatePill` (`r:999`); keep `onClick={() => setDictating(true)}`. *Acceptance:* pill toggles
   `RecorderPanel`; transcript still appends + clamps + sets `dictated`.
5. **Error `<p>` → `Alert`.** Replace lines 255–262 with `Alert variant="destructive"` (keep
   `role="alert"`). *Acceptance:* the four existing error tests still find the alert text.
6. **Reconciliation confirmations (no code beyond above):** keep screenshot-attach **DROPPED**
   (S25 §Div 3 / OQ); keep voice (S25 §Div 5). Confirm the mid-send dismissal guard and reset-on-
   open are preserved across the leaf swaps.
7. **(Cross-org, optional) Error-boundary "Report" entry** (S25 OQ; plan-09 build-step 8) — wire
   `error.tsx`'s Report action to a boundary-reachable reporter prefilled with `error.digest`.
   `FeedbackGate` mounts on success paths only, so this needs a lightweight reporter entry that
   reuses `ReportBugDialog` with `defaultKind="bug"` and a seeded description. **Flagged, not
   required for this organism's redesign.**

**Acceptance (organism-level):** all four existing dialog tests pass unchanged; shake→open→fill→
send→success and →error paths behave identically; AI checkbox hidden when `!aiAvailable`;
mid-send dismissal still blocked; no functionality dropped.

**Tests** (preserve + extend `report-bug-dialog.test.tsx`):
- REUSE existing: transport-reject error, `{ok:false}` error, AI-toggle visibility gated on
  `aiAvailable`, success-state issue link.
- ADD: kind toggle switches title/label/placeholder; Send disabled when empty / re-enabled when
  trimmed-non-empty; dismissal blocked while `isPending`; `appendTranscript` clamps at
  `DESCRIPTION_MAX` and newline-joins; Alert renders the typed error (post-swap).
- Unchanged sibling suites stay green: `use-shake-gesture.test.ts`, `github-feedback.test.ts`
  (from its new core home), `app/feedback/actions.test.ts`.

---

## Consumers — which surfaces mount it

- **S25 Global overlays** (`design/spec/surfaces/25-global-overlays.md` §3 ShakeReporter →
  ReportBugDialog) — the canonical and **only** consumer. Mounted via `FeedbackGate` in
  `apps/web/app/layout.tsx` (root layout), app-wide, on all signed-in routes; shake is the only
  trigger.
- **Potential second entry (flagged, not yet wired):** the S25 error boundary's "Report" action
  (S25 §Div 4 / OQ; plan-09 build-step 8) — would open this dialog prefilled with the trace
  digest. Requires a boundary-reachable reporter mount independent of `FeedbackGate`.
