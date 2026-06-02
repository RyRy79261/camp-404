# ErrorBoundary — organism plan

- **mapsTo + home:** **REUSE + EXTEND** · lives in **`apps/web`** (Next file-convention
  boundaries — NOT a `@camp404/ui` export). Per `component-library.md` §ErrorBoundary:
  *"keep Next file-convention components (app `error.tsx` / `global-error.tsx` /
  `not-found.tsx`)… adopt board's mono trace-code chip (`error.digest`)."* The platform
  service-layer plan (`service-layer/09-platform-crosscutting.md` line 162) classifies
  the three files **REUSE + EXTEND (trace chip + Report action)**. No new package
  component; no service change.
- **Target file paths (all exist today):**
  - `apps/web/app/error.tsx` — route-segment boundary `{ error, reset }`
  - `apps/web/app/global-error.tsx` — root-layout last-resort boundary `{ error, reset }`
  - `apps/web/app/not-found.tsx` — unmatched-route / `notFound()` page
  - (extended) test: `apps/web/components/__tests__/error-pages.test.tsx`

This is **one logical organism rendered as three Next file-convention components**
(`component-library.md` lists three variants: `segment-error · global-error · not-found`).
It is intentionally app-resident, not promoted: the boundaries are bound to Next's
`error`/`global-error`/`not-found` route conventions, depend on `"use client"`, and the
`global-error` variant must render *without* the app CSS (it replaces the root layout).
A `@camp404/ui` primitive cannot own a Next file-convention.

---

## Current state — what exists today (the old design's component/route markup)

All three boundaries already ship and are wired implicitly by Next (no mount site —
Next discovers them by filename). Confirmed by reading the live files.

### `apps/web/app/error.tsx` (verified)
- `"use client"`; `export default function Error({ error, reset })` with
  `error: Error & { digest?: string }`.
- `useRef<HTMLHeadingElement>` + `useEffect(() => { console.error(error); headingRef.current?.focus(); }, [error])`
  — logs the error (digest correlates with server logs) and **moves focus to the
  heading** (`tabIndex={-1}`, `outline-none`) so AT/keyboard users are told the segment
  was swapped (lines 18–26).
- Layout: `<main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center">`.
- Heading `<h1 ref tabIndex={-1}>` "Something went sideways." (`text-2xl font-semibold`).
- Body `<p className="text-sm text-[color:var(--color-muted-foreground)]">` "An
  unexpected error tripped us up. Try again — if it keeps happening, let a camp captain
  know."
- Actions: `<Button onClick={reset}>Try again</Button>` + `<Button variant="outline" asChild><Link href="/">Back to camp</Link></Button>`.
- **Imports the `Button` atom from `@camp404/ui/components/button` (line 5).**
- **GAP vs spec:** no `triangle-alert` IconBadge, **no mono `error.digest` trace chip**,
  no "Report" affordance, heading uses raw `text-2xl font-semibold` (off the
  `--text-*` scale), muted colour via `text-[color:var(--color-muted-foreground)]`
  raw-var utility instead of `text-muted-foreground`.

### `apps/web/app/global-error.tsx` (verified)
- `"use client"`; same `{ error, reset }` signature + focus-to-heading effect.
- **Renders its own `<html lang="en"><body>`** with **inline styles** (lines 25–40):
  `background:"#0d061e"`, `color:"#f6eef7"`, system-ui font — because the root layout
  never rendered and `@camp404/ui/styles.css` is unavailable here.
- Heading "Camp 404 hit a snag." + body "Something failed before the page could load…"
  + a single inline-styled `<button onClick={reset}>Try again</button>` (background
  `#ef1ec1`, comment: *"Mirrors --color-primary oklch(0.65 0.27 340); hardcoded because
  the app CSS vars are unavailable here"*).
- **GAP vs spec:** none required — the hardcoded palette is intentional and documented
  (`25-global-overlays.md` §2 "supplies its own `<html>/<body>` with inline dark-theme
  styles (app CSS unavailable)"). It **cannot** import `@camp404/ui` components (no CSS)
  and must NOT gain the trace chip if doing so requires app tokens. The mono trace chip
  is **scoped to `error.tsx` only**, optionally with inline-styled mono here.

### `apps/web/app/not-found.tsx` (verified)
- Server component (no `"use client"`); `export const metadata = { title: "Page not found" }`
  so the tab title is correct on a client-side miss.
- Same `max-w-lg` centred `<main>` shell. Big `<p className="text-7xl font-bold … text-[color:var(--color-primary)]">404</p>`,
  `<h1>` "You're properly lost.", body, `<Button asChild><Link href="/">Back to camp</Link></Button>`.
- **Imports `Button` from `@camp404/ui/components/button` (line 3).**
- **GAP vs spec:** copy/structure matches the brief; only token normalisation
  (`text-7xl` / raw `text-[color:var(--color-primary)]` → `text-primary`; `text-2xl
  font-semibold` → `--text-*` step). No trace chip (no error here).

### Existing test (verified) — `apps/web/components/__tests__/error-pages.test.tsx`
- not-found: asserts the "Back to camp" link → `/`.
- error: asserts `reset()` fires on "Try again"; asserts the "Back to camp" escape.
- Note in the file: `global-error.tsx` is **excluded** from jsdom (it renders its own
  `<html>/<body>` which the test container can't host cleanly) — covered by manual/e2e.

### Mount confirmation
`apps/web/app/layout.tsx` mounts `AcknowledgementGate` + `FeedbackGate` (the success-path
overlays). It does **NOT** mount the error boundaries — Next mounts them by file
convention. This is the architectural fact behind the "Report" open question (below):
`FeedbackGate` only lives on success paths, so the error boundary cannot reach it.

---

## Composition — leaves, core helpers, services, server/client split

### Server vs client split
- **`error.tsx` / `global-error.tsx`** — **`"use client"`** (mandatory: Next requires
  error boundaries to be Client Components; they take a `reset` function prop and use
  `useEffect` for logging + focus).
- **`not-found.tsx`** — **Server Component** (no client hooks; just renders + a `Link`).
  Keep it server — adding `"use client"` would be a regression.

### Leaf components consumed (link plan files)
| Leaf | Plan file | Used in | Role |
|---|---|---|---|
| **Button** (atom, REUSE) | `design/spec/impl/components/atom-button.md` | `error.tsx`, `not-found.tsx` | "Try again" (`reset`, `variant="default"`), "Back to camp" (`variant="outline" asChild` + `Link`), (proposed) "Report" (`variant="ghost"`). `global-error.tsx` uses a **raw inline-styled `<button>`** — cannot import Button (no CSS). |
| **IconBadge** (atom, PROMOTE — **must land first**) | `design/spec/impl/components/atom-iconbadge.md` | `error.tsx` (new) | The board's `triangle-alert` disc: `<IconBadge size="lg" shape="circle" tone="destructive" icon={TriangleAlert} />`. IconBadge plan §Organisms + §Absorbs both list **ErrorBoundary → triangle-alert ic → `size="lg" shape="circle" tone="destructive"`** (board `31-s22-global-overlays.txt` ErrorBoundary `ic` 56×56 → `lg`, `#f83e5a1f` → `destructive/12%`). |
| **CodeDisplay** (molecule, PROMOTE — **must land first**) | `design/spec/impl/components/molecule-codedisplay.md` | `error.tsx` (new) | The mono trace chip surfacing `error.digest`: `<CodeDisplay value={error.digest} readonly aria-label="Error trace" />` (readonly variant, JetBrains Mono `--text-mono`). **Conditional** — only when `error.digest` is present. See API note: CodeDisplay's `readonly` variant exactly matches "display a mono code, no actions." |
| **Card** (molecule, REUSE — optional) | `design/spec/impl/components/molecule-card.md` | `error.tsx` (optional wrapper) | The Card plan §Consumers explicitly lists **`ErrorBoundary` → variant `default` → "Error + retry content."** The board frames the error as a centred card (`max-w-lg`). Wrapping the heading/body/chip/actions in `Card`/`CardContent` is the spec-faithful enrichment; or keep the current bare-`<main>` centring (lighter). Decide at build (board says card; code is bare main) — **recommend Card** for parity, but it is presentation-equivalent. |
| **Link** (`next/link`) | — (Next primitive) | `error.tsx`, `not-found.tsx` | "Back to camp" → `/`. |

The `triangle-alert` glyph is `TriangleAlert` from `lucide-react` (already a peer used
across the package). `error.digest` is the mono trace value.

### @camp404/core helpers
**None.** Error boundaries carry no domain logic, no rank/clearance, no validation.
Nothing from `@camp404/core` is needed (no `hasCampAccess`/`rankLevel`/etc.). The trace
value is `error.digest` straight from the Next-supplied `error` prop.

### Services / server-actions called
**None** for the recovery path. The boundaries do not fetch, mutate, or call any
server action. Logging is `console.error(error)` only (digest correlates with the
server log — `25-global-overlays.md` line 175).

The **one proposed wiring** (open question, NOT a hard requirement of this plan) is the
board's "Report" action → open the feedback reporter pre-filled with the trace digest.
That would touch `submitFeedbackAction` (`service-layer/09`) **indirectly** via a
`ReportBugDialog` instance. It is blocked by an architectural fact: `FeedbackGate` only
mounts on success paths (`apps/web/app/layout.tsx`), so the boundary cannot reach the
app-wide reporter — it would need its **own lightweight reporter entry**
(`25-global-overlays.md` open questions; `service-layer/09` step 8). **Default: surface
the digest in the chip (so a manually-triggered shake report can carry it) and DEFER
the in-boundary Report button** until the boundary-reachable reporter entry is built.

---

## API & data flow — props/inputs, fetch vs receive, state flow

### Inputs (all supplied by Next; no props the app passes)
| File | Props | Source |
|---|---|---|
| `error.tsx` | `{ error: Error & { digest?: string }; reset: () => void }` | Next error-boundary convention |
| `global-error.tsx` | `{ error: Error & { digest?: string }; reset: () => void }` | Next root-error convention |
| `not-found.tsx` | none | Next not-found convention (also `notFound()`) |

- **What it fetches:** nothing. **What it receives:** the caught `error` object + a
  `reset` callback (segment re-render) from Next.
- **State flow:**
  - `error.tsx`: local `headingRef` only. On mount → `console.error(error)` + focus
    heading. "Try again" → `reset()` (Next re-mounts the failed segment → success or the
    boundary re-renders). "Back to camp" → client `Link` nav to `/`. The mono chip is a
    pure read of `error.digest` (no state).
  - `global-error.tsx`: identical, but `reset` re-renders from the root; no `Link`/Button
    atom (inline `<button>`).
  - `not-found.tsx`: stateless; a single `Link` to `/`.
- **Forms:** none. No actions, no validation, no submitting state on the recovery path.

### Copy reconciliation (locked by `25-global-overlays.md` §Divergence 4)
Keep the **code's** brand-voice copy + recovery actions + a11y; **adopt** the board's
mono trace chip and (optionally, deferred) Report action. Do **not** replace
"Something went sideways." with the board's "404 — that wasn't supposed to happen"
(the board label conflates with the not-found 404 motif; the code copy is canonical).
Final copy:
- `error.tsx` heading "Something went sideways." / body "An unexpected error tripped us
  up. Try again — if it keeps happening, let a camp captain know."
- `global-error.tsx` heading "Camp 404 hit a snag." / body "Something failed before the
  page could load. Try again — if it persists, let a camp captain know."
- `not-found.tsx` "404" + "You're properly lost." + the existing body.

---

## States — every state incl. the global matrix + gating

This organism IS the **error/not-found** corner of the global state matrix — it has no
empty/loading/populated/submitting/success states of its own; it exists *because* an
error happened. Enumerated against the matrix:

| Matrix state | Applies? | Behaviour |
|---|---|---|
| **Empty** | n/a | No data surface. (The board "no content" cases are EmptyState, not this.) |
| **Loading** | n/a | The boundary renders synchronously from the `error` prop; no async fetch, no spinner. |
| **Error shown** | ✅ primary | `error.tsx` / `global-error.tsx` render the recovery card; this is the only "populated" state. `not-found.tsx` is the unmatched-route state. |
| **Retrying** | ✅ | "Try again" calls `reset()`; Next re-renders the segment. No spinner on the button (re-render is instant; if it errors again the boundary re-mounts). Documented variant in `component-library.md` (`States: error shown · retrying`). |
| **Submitting** | n/a | No form/action on the recovery path (only the deferred Report flow would have one, owned by `ReportBugDialog`). |
| **Success** | n/a | "Success" = the segment recovered and the boundary unmounts (Next replaces it with the re-rendered children). Nothing to render. |
| **Disabled** | n/a | Buttons are always enabled; recovery must never be blocked. |
| **Trace-present vs trace-absent** | ✅ (new) | The mono `error.digest` chip renders **only when `error.digest` is set** (production builds set it; dev throws may not). Absent → omit the chip entirely (no empty chip). |
| **Preview-but-locked / captain gating** | ❌ **N/A** | `25-global-overlays.md` §"Gating states" is explicit: *"Preview-but-locked — not applicable; all five overlays are member-level (no captain-only data). The CaptainLock 'VIEW ONLY' treatment lives on captain surfaces, not here."* The error/not-found boundaries are **universal — they render even for logged-out visitors** (`25-global-overlays.md` line 18). **No CaptainLock, no rank read, no `requireClearance`.** |
| **AI / E2E modes** | n/a | The boundary itself has no AI/E2E branch (those belong to the feedback path it does not own). |

**Variants** (per `component-library.md`): `segment-error` (`error.tsx`) ·
`global-error` (`global-error.tsx`) · `not-found` (`not-found.tsx`).

**Accessibility states (preserve — do not regress):**
- Focus moves to the heading on mount (`error.tsx` + `global-error.tsx`), `tabIndex={-1}`,
  `outline-none`. This is the AT announcement that the segment was swapped.
- `triangle-alert` IconBadge icon is `aria-hidden` (the heading is the accessible label —
  IconBadge plan §a11y).
- The trace chip uses CodeDisplay's `readonly` `role="group"` with `aria-label="Error trace"`.

---

## Build steps — ordered, with prerequisites + acceptance + tests

### Prerequisites (must land first)
1. **Foundations (Phase 0):** `--color-destructive` (exists), the `--font-mono` /
   `--text-mono` wiring (`foundations-tokens.md`) so the trace chip renders JetBrains
   Mono and the heading/body snap onto `--text-*`. *(Status tokens success/warning are
   NOT needed here — the only tint is `destructive`, which already exists.)*
2. **`IconBadge`** promoted to `@camp404/ui` (`atom-iconbadge.md`) — needed for the
   `triangle-alert` disc. `destructive` tone does not depend on the new status tokens.
3. **`CodeDisplay`** promoted to `@camp404/ui` (`molecule-codedisplay.md`), specifically
   its `readonly` variant — needed for the mono trace chip.
4. *(If wrapping in Card)* **`Card`** variant work (`molecule-card.md`) — already exists;
   `default` variant suffices, no new prop required.

The boundaries already ship and are green, so steps 2–4 are the *enrichment* gate, not a
build-from-zero gate. The recovery actions + a11y + copy stay exactly as-is throughout.

### Step 1 — `error.tsx` EXTEND: add the mono trace chip
- Render `<CodeDisplay value={error.digest} readonly aria-label="Error trace" />`
  **conditionally** (`{error.digest ? … : null}`), placed below the body, above the
  actions. Mono face surfaces the digest so a member can quote it (and so a future
  shake-report carries it).
- Token-normalise: heading `text-2xl font-semibold` → the `--text-subtitle`/`--text-title`
  step; `text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`.
- **Acceptance:** when `error.digest` is set, a mono chip with the digest renders;
  when absent, no chip node exists. `reset()` still fires on "Try again"; "Back to camp"
  still → `/`; focus still moves to the heading on mount.

### Step 2 — `error.tsx` EXTEND: add the `triangle-alert` IconBadge
- Add `<IconBadge size="lg" shape="circle" tone="destructive" icon={TriangleAlert} />`
  above the heading (board ErrorBoundary `ic`). Icon `aria-hidden`.
- *(Optional, recommended)* wrap heading/body/chip/actions in `Card` + `CardContent`
  (`variant="default"`, `max-w-lg`) per the board's card framing and the Card plan's
  ErrorBoundary consumer row. Equivalent to keeping the bare `<main>` centring — pick one.
- **Acceptance:** the destructive disc renders; icon is `aria-hidden`; layout still
  centred `max-w-lg`; no raw hex introduced.

### Step 3 — `not-found.tsx` EXTEND: token normalisation only
- `text-7xl font-bold … text-[color:var(--color-primary)]` → keep the big "404" but
  resolve colour via `text-primary`; `text-2xl font-semibold` → `--text-*` step;
  muted body → `text-muted-foreground`. **Keep the server component** (no `"use client"`).
- Keep `metadata = { title: "Page not found" }` and the "Back to camp" `Button asChild` Link.
- **Acceptance:** "Back to camp" link still → `/`; no raw `text-[color:var(...)]` utilities;
  not-found remains a Server Component.

### Step 4 — `global-error.tsx`: leave the inline palette, optional inline mono digest
- Do **NOT** import `@camp404/ui` here (no CSS — root layout never rendered). Keep the
  hardcoded `#0d061e`/`#f6eef7`/`#ef1ec1` inline styles + the documented comment.
- *(Optional)* surface `error.digest` as an inline-styled monospace line
  (`fontFamily:"ui-monospace, monospace"`) — same diagnostic value, no token dependency.
- Keep "Try again" (`reset`) + focus-to-heading.
- **Acceptance:** renders standalone `<html>/<body>`; "Try again" calls `reset()`;
  no `@camp404/ui` import; (if added) digest line is inline-styled, not token-classed.

### Step 5 — (DEFERRED, open question) in-boundary "Report" action
- Board offers a "Report" button on the error card. Wiring it to open `ReportBugDialog`
  pre-filled with `error.digest` requires a **boundary-reachable reporter entry**
  (`FeedbackGate` mounts on success paths only). **Default: defer.** If built: add a
  `variant="ghost"` "Report" Button in `error.tsx` that mounts a local `ReportBugDialog`
  (or a lightweight reporter) seeded with the digest → `submitFeedbackAction`
  (`service-layer/09`). This is the only path that touches a server action; it is
  explicitly out of scope for the minimal EXTEND and flagged in
  `25-global-overlays.md` open questions + `service-layer/09` step 8.

### Step 6 — Tests: extend `apps/web/components/__tests__/error-pages.test.tsx`
- **Keep** the existing assertions (`reset()` fires; both "Back to camp" links → `/`).
- **Add:** error boundary renders the mono trace chip when `error.digest` is set
  (`render(<ErrorPage error={Object.assign(new Error("boom"), { digest: "8f3a2" })} reset={…} />)`
  → `getByText(/8f3a2/)` or the chip's `aria-label="Error trace"`).
- **Add:** no chip node when `error.digest` is undefined.
- **Add:** focus-to-heading preserved (`document.activeElement` is the heading after mount).
- **Add:** the `triangle-alert` IconBadge icon is `aria-hidden`.
- `global-error.tsx` stays out of jsdom (renders its own `<html>/<body>`) — manual/e2e,
  per the existing file note.
- **Acceptance:** `pnpm --filter @camp404/web test` green; recovery actions + a11y
  unchanged; new trace-chip assertions pass (`service-layer/09` step 8 acceptance).

---

## Consumers — which surfaces mount it

The ErrorBoundary is **not mounted by any surface** — Next mounts the three files by
convention, app-wide:
- **`error.tsx`** wraps every route segment under `apps/web/app/` (catches uncaught
  render/server-action errors per segment).
- **`global-error.tsx`** is the last-resort boundary for errors in the **root layout
  itself** (`apps/web/app/layout.tsx`) — replaces the whole document.
- **`not-found.tsx`** renders for any unmatched route and every `notFound()` call,
  inside the root-layout shell.

Per `component-library.md` §ErrorBoundary "Used by: **global overlays**
(route-segment / root-layout / 404)" and `25-global-overlays.md` §4 — it is one of the
five system-level overlays. It self-renders **for every visitor including logged-out**
(unlike the other four overlays, which self-gate on auth), because errors and missing
routes are universal.
