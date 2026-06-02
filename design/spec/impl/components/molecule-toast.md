# Toast — molecule plan

- **mapsTo:** NEW · Target file: `packages/ui/src/components/toast.tsx`

No toast or sonner primitive exists anywhere in `@camp404/ui` or `apps/web`.
Confirmed by:
- Listing `packages/ui/src/components/` — no `toast.tsx`, no `sonner.tsx`.
- `grep -r "toast\|sonner" apps/web/src` — zero matches.
- `grep -r "toast\|sonner" packages/ui/src` — zero matches.
- `design/spec/surfaces/25-global-overlays.md §5` states explicitly: "NEW component
  — no toast/sonner primitive exists in `@camp404/ui` yet."
- `design/spec/impl/service-layer/09-platform-crosscutting.md:98` confirms the same.

Classification: **NEW** — build from scratch inside `packages/ui`.

---

## Current state — does it exist? where? gap vs spec

**Neither `packages/ui` nor `apps/web` contain any toast component or emitter.**

| Location | Verdict | Evidence |
|---|---|---|
| `packages/ui/src/components/toast.tsx` | Does not exist | directory listing |
| `apps/web` sonner or toast import | Does not exist | grep across all `.ts/.tsx` files |
| Board `31-s22-global-overlays.txt:74–78` | Design only — no code backing | the board is the sole source of geometry/token truth |

Board draw (exact extract from `design/.spec-extract/boards/31-s22-global-overlays.txt`):

```text
▸ "Toast" {w:fill_container gap:10 pad:[12,14] ai:center r:$radius fill:$popover stroke:$border}
  ⊙ check ($accent) [lucide]
  T "Saved."  [Inter/14px/500/$foreground]
  T "Undo"  [Inter/13px/600/$accent]
```

The board draws the **success/info case** only: `check` icon in `$accent` colour,
message, optional "Undo" link. The spec (`component-library.md:380`) extends this to
four status tones (success/info/warning/error) and two structural variants
(message-only vs with-action). Status tokens (`success`, `warning`) are a prerequisite
that must land before Toast ships (noted in `component-library.md:601–602` and
`design/spec/README.md:202–203`).

The board's `$accent` check icon represents the **success** tone in the normalised
token system: `design/spec/surfaces/25-global-overlays.md §Divergence 2` confirms
"board's `$accent` check is the success case" — reconcile to `$success` per the
affirmative-write rule (`design-tokens.md §2.2`).

**Gap vs spec:**
- No component, no emitter, no provider — everything is a build.
- Board only shows the success/with-action variant; success/info/warning/error tones
  and message-only variant are spec-extended (not board-contradicted).
- `popup` broadcast delivery rendering is flagged as an open question in
  `25-global-overlays.md §Open-questions` — it likely reuses Toast, but that wiring
  is a product decision deferred to Phase 6 (notifications domain). Toast itself is
  mutation-agnostic.

---

## API — props, variants, sizes, states

```ts
import type { LucideIcon } from "lucide-react";

/** Semantic tone — drives status icon + colour. */
export type ToastTone = "success" | "info" | "warning" | "error";

/** A single queued toast item. */
export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
  /** Label for the optional inline action button (e.g. "Undo"). */
  actionLabel?: string;
  /** Callback invoked when the action button is tapped. */
  onAction?: () => void;
  /**
   * Auto-dismiss delay in milliseconds. Defaults to 4000 (4 s).
   * Pass 0 to keep the toast until the action is tapped or the consumer
   * explicitly removes it.
   */
  duration?: number;
}

/** Props for the presentational strip rendered per queued item. */
export interface ToastProps extends ToastItem {
  /** Called when the toast has finished (auto-dismiss or action tap). */
  onDismiss: (id: string) => void;
  /** Additional className forwarded to the root element. */
  className?: string;
}

/**
 * ToastProvider — mounts app-wide in the root layout.
 * Hosts the queue + portal; no props required.
 */
export interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Imperative emitter — call from any client component or server-action
 * callback. Not coupled to next/* or any DB import.
 *
 * toast({ tone: "success", message: "Saved.", actionLabel: "Undo", onAction: undoFn });
 */
export declare function toast(item: Omit<ToastItem, "id">): void;

/**
 * Hook for consuming the queue (used internally by ToastProvider;
 * exposed for testing and advanced consumers).
 */
export declare function useToast(): {
  items: ToastItem[];
  dismiss: (id: string) => void;
};
```

### Variants

| Variant | Structural description | Board precedent |
|---|---|---|
| `message-only` | Icon + message, no action button | Not board-drawn; implied by spec |
| `with-action` | Icon + message + inline action label | Board "Undo" — canonical |

Variant is inferred from the presence of `actionLabel` — no explicit `variant` prop.

### Tones

| Tone | Status icon | Icon colour | Fill | Border |
|---|---|---|---|---|
| `success` | `CircleCheck` | `text-success` | `bg-popover` | `border-border` |
| `info` | `Info` | `text-accent` | `bg-popover` | `border-border` |
| `warning` | `TriangleAlert` | `text-warning` | `bg-popover` | `border-border` |
| `error` | `TriangleAlert` | `text-destructive` | `bg-popover` | `border-border` |

The board specifies `fill:$popover stroke:$border` as the Toast **strip** background —
this is the container chrome, consistent across all tones. The tone-driven colour
applies only to the icon (and optionally the action label text). This matches the
board's success example: `check ($accent)` icon on a `$popover` strip.

After token normalisation: the board's success `$accent` check → `$success` (the
affirmative-write rule, `design-tokens.md §2.2:159–163` and
`25-global-overlays.md §Divergence 2`). Info notifications stay `$accent`.

### States

| State | Behaviour |
|---|---|
| `entering` | Toast mounts; animate in (slide up + fade; respects `prefers-reduced-motion`). |
| `shown` | Full visibility; auto-dismiss timer running. |
| `auto-dismiss` | Timer fires → `onDismiss(id)` → unmount. |
| `action-tapped` | `onAction()` called by consumer; `onDismiss(id)` called immediately after. |

### Sizes

Single size. Width = `w-full` inside the portal column (max-width constrained by
the provider's positioning container, not by Toast itself). Height is content-driven.
Padding matches board: `pad:[12,14]` → `py-3 px-3.5`.

---

## Tokens & type — exact design tokens + type-scale roles

### Layout geometry (from board)

| Property | Token / value | Source |
|---|---|---|
| Container fill | `bg-popover` | board `fill:$popover` |
| Container border | `border border-border` | board `stroke:$border` |
| Border radius | `rounded-md` = `--radius` (0.625rem) | board `r:$radius`; `design-tokens.md §3` |
| Padding | `py-3 px-3.5` (12px × 14px) | board `pad:[12,14]` |
| Internal gap | `gap-2.5` (10px) | board `gap:10` |
| Alignment | `items-center` | board `ai:center` |

### Colour tokens

| Element | Token | Notes |
|---|---|---|
| Container background | `bg-popover` | = `--color-card` elevation; dark `$popover` |
| Container border | `border-border` | `--color-border` |
| Message text | `text-foreground` | board `$foreground`; `--color-foreground` |
| Action label text | `text-accent` | board `$accent`; consistent with info/link affordance |
| Success icon | `text-success` | `--color-success` (NEW token) — replaces board `$accent` per affirmative-write rule |
| Info icon | `text-accent` | `--color-accent` (= `--color-info`) |
| Warning icon | `text-warning` | `--color-warning` (NEW token) |
| Error icon | `text-destructive` | `--color-destructive` |

`--color-success` and `--color-warning` are NEW tokens defined in
`design/spec/design-tokens.md §2.2` and must land in
`packages/ui/src/styles/globals.css` before Toast can pass visual review.

### Type-scale roles (from `design-tokens.md §1.1`)

| Element | Role | Face | Size | Weight | Board source |
|---|---|---|---|---|---|
| Message | `--text-body-strong` | Inter | 14px | 500 | board `Inter/14px/500/$foreground` |
| Action label | `--text-label` | Inter | 13px | 600 | board `Inter/13px/600/$accent` |

No JetBrains Mono in Toast — this is feedback copy, not terminal/data output.

---

## Composition & deps — atoms/primitives + @camp404/core helpers

- **`cn`** from `../lib/utils` — standard utility used by every `@camp404/ui`
  component (confirmed via `packages/ui/src/components/button.tsx:5`).
- **Lucide React** icons: `CircleCheck`, `Info`, `TriangleAlert` — already a peer
  dep of `@camp404/ui`; no new dep.
- **`React.createContext` + `useReducer`** — internal queue management for the
  provider/emitter seam. No external state library.
- **`ReactDOM.createPortal`** — Toast strips render into a fixed portal at the bottom
  of `<body>` (or a dedicated root node), so they float above all page content
  without z-index conflicts.
- **No `@camp404/core` dependency** — Toast is pure presentation + React event wiring.
  The `toast()` emitter must carry no `next/*` coupling (confirmed in
  `design/spec/impl/service-layer/09-platform-crosscutting.md:98`).
- **No Radix primitive** — Toast is a plain `div` strip; it is not a Dialog, Popover,
  or accessible combobox. The action button is a plain `<button>` with
  `type="button"`.

---

## Absorbs — candidates replaced (from merge map)

The merge map in `design/spec/component-library.md §Merge map` lists no separate
Toast entry — Toast has no absorbed sibling. It is a net-new canonical component with
no duplicate candidates in the 57-item inventory.

Per `design/spec/component-library.md:380`:

> "no toast/sonner primitive exists; recommendations flag it"

The only candidates that could have overlapped Toast are:
- **Alert** — persistent inline banners, not transient floating strips; explicitly
  kept separate (Alert = inline, Toast = floating transient). No absorb.
- **`popup` broadcast delivery** — `broadcast_presentation='popup'`; ownership
  deliberately deferred as an open question (`25-global-overlays.md §Open-questions`).
  If resolved to reuse Toast, the notification-delivery renderer wraps Toast as a
  consumer, not an absorbed candidate.

**No candidates absorbed. Toast ships alone.**

---

## Stories & tests

### Storybook stories

```text
Toast.stories.tsx (packages/ui/src/components/)

Story: AllTones
  — renders four Toast strips (success / info / warning / error)
  — each with default icon and message "Saved." / "Heads up." / "Almost full." / "Failed."

Story: MessageOnly
  — tone="success", message="Profile saved." — no actionLabel
  — confirms strip renders without action button

Story: WithAction
  — tone="success", message="Saved.", actionLabel="Undo"
  — confirm action button visible; clicking it calls onAction + onDismiss

Story: LongMessage
  — tone="info", message that wraps across two lines
  — confirms icon stays vertically centred (ai:center)

Story: AutoDismiss (play function)
  — tone="success", duration=1000
  — uses @storybook/test step to wait; confirm onDismiss called

Story: InteractivePlayground (args table)
  — all props exposed as Storybook controls
  — default: tone="success", message="Saved.", actionLabel="Undo", duration=4000
```

### Vitest / RTL test cases

```text
toast.test.tsx
(packages/ui/src/components/__tests__/ or co-located)

— renders message text
— renders default icon for each tone (CircleCheck / Info / TriangleAlert × 2)
— icon is aria-hidden="true"
— renders action button when actionLabel is provided
— does NOT render action button when actionLabel is absent
— clicking action button calls onAction
— clicking action button calls onDismiss(id)
— onDismiss is called after duration ms (use fake timers)
— onDismiss is NOT called before duration ms elapses
— applies role="status" to the strip (polite live region for all tones)
— applies correct icon colour class for each tone
— forwards className to root element
— does not import any next/* module (import graph check or grep)

useToast hook:
— dismiss(id) removes the item from the queue
— multiple toasts queue in order
— dismissing one id does not affect others

toast() emitter:
— calling toast({tone, message}) adds an item to the queue (read via useToast)
— auto-generated id is unique per call
— duration default is 4000 when not supplied
```

### Accessibility notes

- The Toast strip carries `role="status"` (all tones): this is a polite live region;
  the AT announces the message when not busy. Appropriate for transient confirmations
  ("Saved.", "Heads up."). No tone in Toast is as urgent as a validation error
  (those use `Alert tone="destructive"` with `role="alert"`).
- The status icon is `aria-hidden="true"` — decorative; meaning is carried by the
  message text.
- The action button must have a visible text label (no icon-only button); the label
  ("Undo") is its accessible name.
- The `ToastProvider` portal container should carry `aria-live="polite"` and
  `aria-atomic="false"` so multiple queued toasts are announced individually.
- Entrance animation must respect `prefers-reduced-motion: reduce` — skip the
  slide/fade when the user has requested reduced motion.
- The portal `div` must not be `aria-hidden` (it contains live content for AT users).

---

## Build steps — ordered + acceptance criteria

### Step 1 — Status tokens prerequisite (not this ticket)

`--color-success`, `--color-success-foreground`, `--color-warning`,
`--color-warning-foreground` must be defined in
`packages/ui/src/styles/globals.css @theme` before Toast can pass visual review.
Tracked in `design/spec/impl/foundations-tokens.md`. Do not ship Toast to consumers
until this is done.

**Acceptance:** `bg-success`, `text-success`, `bg-warning`, `text-warning` utilities
resolve to visible colours distinct from `$accent` and `$destructive` in the browser.

### Step 2 — Build `packages/ui/src/components/toast.tsx`

Implement `Toast` (presentational strip), `ToastProvider` (queue + portal), and the
`toast()` / `useToast()` emitter pair. Export all four from `packages/ui/src/index.ts`
(or the package's barrel).

Architecture:
1. A `ToastContext` backed by `useReducer`; actions `ADD | DISMISS`.
2. `ToastProvider` wraps `ToastContext.Provider` and renders a `ReactDOM.createPortal`
   into `document.body` (or `#toast-root` if the layout inserts one) containing a
   fixed-position column of `<Toast>` strips.
3. `toast()` is an imperative escape hatch: a module-level ref to the dispatch
   function, set once when the Provider mounts. This matches the `react-hot-toast`
   pattern and ensures the emitter is callable from server-action result handlers
   without importing React context at the call site.
4. Each `Toast` strip manages its own `setTimeout` for auto-dismiss; duration 0
   disables auto-dismiss.

**Acceptance criteria:**
- `packages/ui/src/components/toast.tsx` exists and exports `Toast`,
  `ToastProvider`, `toast`, `useToast`, `ToastItem`, `ToastTone`.
- All four tones render the correct icon (CircleCheck / Info / TriangleAlert) in the
  correct token colour per the table above.
- `fill:$popover stroke:$border rounded-md` container is consistent across all tones.
- Message is `text-sm font-medium text-foreground` (14px/500).
- Action label is `text-[13px] font-semibold text-accent` (13px/600).
- `role="status"` on the strip root.
- Icon is `aria-hidden="true"`.
- No raw hex, no `emerald-*`, no `amber-*`, no `[color:var(--color-*)]` verbose form
  in the source.
- No `next/*` import anywhere in the Toast module tree (emitter is framework-agnostic).
- `prefers-reduced-motion` respected in CSS animation.

### Step 3 — Mount `ToastProvider` app-wide

Add `<ToastProvider>` to `apps/web/app/layout.tsx` root layout, wrapping the app
shell (outside the route tree but inside the auth/session boundary).

**Acceptance:** mounting the provider does not break the existing layout; no TS error;
`toast()` callable from any client component in the app.

### Step 4 — Add Storybook stories

Create `packages/ui/src/components/toast.stories.tsx` with all stories listed above.

**Acceptance:** `pnpm storybook` renders all Toast stories without error; AllTones
shows four visually distinct icon colours on a consistent `$popover` strip background.

### Step 5 — Add vitest/RTL tests

Create `packages/ui/src/components/__tests__/toast.test.tsx` with all test cases
listed above. Use `vi.useFakeTimers()` for auto-dismiss timing tests.

**Acceptance:** `pnpm test` in `packages/ui` passes all Toast tests; coverage
includes all tones, action wiring, auto-dismiss, queue management, and the
no-`next/*`-import guard.

### Step 6 — Wire first consumer (mutation confirmation)

Pick one mutation surface that the board illustrates ("Saved." with "Undo") as the
smoke test for the wiring. The announcements manager
(`apps/web/app/captains/announcements/announcements-manager.tsx`) already has a
success banner (`text-emerald-400`) that is a Alert-migration target — once that
Alert migration lands, the Draft-saved / Published confirmation is a candidate to
become `toast({ tone: "success", message: "Draft saved.", actionLabel: "Undo", onAction: revertFn })`.

**Acceptance:** the mutation success path raises a Toast strip that auto-dismisses
after 4 s; tapping "Undo" invokes the reversal and dismisses immediately. No raw
`emerald-400` remains.

---

## Consumers — which molecules/organisms/surfaces use it

Toast is a global singleton mounted app-wide. The `toast()` emitter is the call
point; every surface that performs a mutation is a potential consumer.

| Consumer | Surface / file | Expected usage |
|---|---|---|
| `AnnouncementsManager` | `apps/web/app/captains/announcements/announcements-manager.tsx` | `tone="success"` on Draft saved / Published; `tone="error"` on action failure |
| `InviteForm` (organism, new build) | `apps/web/app/tools/invite/invite-form.tsx` | `tone="success"` on invite created; actionLabel="Copy" or none |
| `ProfileEditForm` | `apps/web/app/profile/edit/edit-form.tsx` | `tone="success"` on profile saved (currently no success feedback shown) |
| `ReportBugDialog` success branch | `apps/web/components/feedback/report-bug-dialog.tsx` | Currently uses in-dialog success view — Toast is an optional lighter-weight alternative; decision deferred to build phase |
| `popup` delivery renderer | Phase 6 / notifications domain | `tone="info"` — reuse Toast for `broadcast_presentation='popup'` deliveries if product resolves the open question (`25-global-overlays.md §Open-questions`) in favour of Toast |
| Any optimistic-flip mutation surface | Various captain/member tool surfaces (roster actions, questionnaire runner completion) | `tone="success"` + optional Undo wiring per mutation semantics |

Toast is a **leaf consumer** — it depends on atoms (`cn`, Lucide icons) only, and no
other molecule or organism depends on Toast. It is safe to build in parallel with
Badge, Alert, and other Phase 5 molecules once the status tokens (Step 1) are in
place.
