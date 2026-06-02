# NotificationRow — organism plan

- **mapsTo + home:** **NEW** · lives in **`apps/web`** (app-local) per
  `component-library.md` ("NEW (app-local `<li>`)") — it is **not** promoted to
  `@camp404/ui`. The row binds to the app-private `InboxItem` shape and the
  domain-specific presentation→icon mapping, neither of which belongs in the
  framework-agnostic UI package. It composes promoted `@camp404/ui` atoms
  (`IconBadge`, `Badge`) but is itself a `apps/web` organism.
- **Target file:** `apps/web/app/notifications/notification-row.tsx`
  (extracted from the inline `<li>` currently in
  `apps/web/app/notifications/page.tsx`). The page (`page.tsx`) remains the RSC
  data-fetch + gate host; `notification-row.tsx` is the presentation organism.

> Scope note: `NotificationRow` is a **single delivery `<li>`**. The surrounding
> `<ul>` list, page header, `DetailHeader`, and `EmptyState` belong to the
> notifications **surface** (`apps/web/app/notifications/page.tsx`,
> see `surfaces/09-notifications.md`), not to this organism. This plan covers the
> row only and names the surface as its consumer.

---

## Current state — what exists today

The row is **not yet an extracted component**. It is an inline `<li>` block
hand-rolled inside the inbox page render.

- **`apps/web/app/notifications/page.tsx`** (the only current home):
  - **`presentationIcon(p)`** (`L18–22`) — pure helper that maps
    `InboxItem["presentation"]` → a lucide icon JSX element:
    `acknowledge`→`<Megaphone className="h-4 w-4" />`,
    `popup`→`<MessageSquare className="h-4 w-4" />`,
    `feed`/fallback→`<Bell className="h-4 w-4" />`. Inline in the page module.
  - **The `<li>` row** (`L57–101`) — rendered per item inside the `<ul>`
    (`L56`). It carries:
    - `isNew` derived inline as `item.readAt === null` (`L58`).
    - Unread styling: `border-[color:var(--color-primary)]/40 bg-accent/20`
      conditional on `isNew` (`L64–66`) — verbose `var()` form, off the canonical
      `border-primary/40` token utility.
    - The presentation icon rendered as a **bare** `<span className="text-muted-foreground">`
      around `presentationIcon(item.presentation)` (`L71–73`) — **no icon circle**;
      this is the degenerate `IconBadge` case flagged in `atom-iconbadge.md`
      ("Degenerate case: no icon container — icon is inline … the NotificationRow
      redesign will replace with `IconBadge`").
    - Title `<h2 className="text-sm font-semibold leading-tight">` (`L74–76`).
    - "New" pill — inline `<span>` (`L77–81`):
      `rounded-full bg-[color:var(--color-primary)] px-1.5 py-0.5 text-[10px]
      font-semibold text-[color:var(--color-primary-foreground)]` — the
      hand-rolled pill the `Badge` plan (`atom-badge.md:23`, merge map `new-pill`)
      absorbs as `tone="primary" variant="solid"`.
    - Timestamp `<time className="shrink-0 text-xs text-muted-foreground">`
      rendering `new Date(item.createdAt).toLocaleDateString()` (`L83–85`) —
      **date-only**; the board wants relative ("2d ago") per
      `09-notifications.md:212` Divergence + OQ1.
    - Body `<p className="… whitespace-pre-wrap text-sm text-muted-foreground">`
      (`L87–89`).
    - Attribution `<p>` (`L90–99`) rendered **only when `item.senderName` is
      truthy**: `From {senderName}` + ack-status suffix
      (`acknowledgedAt`→`· acknowledged`, else `presentation==='acknowledge'`→
      `· awaiting acknowledgement`, else empty). Null `senderName` suppresses the
      whole line (including the ack hint) — the known edge case in
      `09-notifications.md:171`.

- **`apps/web/lib/notifications.ts`** — `"server-only"` facade re-exporting
  `listInbox` / `markRead` and the **`InboxItem`** type (origin
  `packages/db/src/broadcasts.ts:460–469`). The page imports the type + functions
  from here.
- **`packages/ui/src/`** — contains **no** notification component (grep: only an
  unrelated mention in the DEAD `control-panel.tsx`). Confirms NEW / app-local.

No prior extracted `NotificationRow` exists in either package. The work is:
extract → restyle to the board → swap hand-rolled chrome for promoted atoms →
relative time.

---

## Composition

### Leaf components it consumes (link their plan files)

| Leaf | Plan | Usage in the row |
|---|---|---|
| **IconBadge** (PROMOTE → `@camp404/ui`) | [`atom-iconbadge.md`](./atom-iconbadge.md) | The 40×40 presentation icon circle. `<IconBadge size="sm" shape="circle" tone="muted" icon={presentationIcon(presentation)} aria-hidden />`. Replaces the current bare inline `<span>` (the explicit "degenerate case" the IconBadge plan calls out, `atom-iconbadge.md:18`). Board row anatomy: `40×40 r:999 fill:$muted`, presentation icon centred `$foreground`. **Note:** board fill is `$muted` (tone `muted`), icon `$foreground` — `IconBadge` `muted` tone renders `text-muted-foreground`; pass the icon at the size the board needs. The size `sm` maps to 34px in the IconBadge canon — the board draws 40px; per the IconBadge size-normalisation table 40px snaps to `sm`. Use `size="sm"`, accepting the documented snap. |
| **Badge** (PROMOTE → `@camp404/ui`) | [`atom-badge.md`](./atom-badge.md) | The "New" pill: `<Badge tone="primary" variant="solid" size="xs">New</Badge>`. Listed explicitly in the Badge merge map (`new-pill`, `atom-badge.md:196,308`) and consumers table (`NotificationRow … "New" pill … tone="primary" variant="solid"`, `atom-badge.md:346`). Pill is decorative beside an already-labelled title → `aria-hidden`. |

`presentationIcon` is the only other dependency — see core/helpers below.

### @camp404/core helpers

- **`presentationIcon(presentation)`** — maps `AnnouncementPresentation` →
  `LucideIcon`. **Stays app-local / UI-presentational**, NOT in `@camp404/core`.
  Rationale: it returns lucide icon **components/JSX**, which is a presentation
  concern. The service-layer plan explicitly recommends keeping the
  presentation→icon `PresentationMeta` surface-local because it "carries lucide
  JSX/icon names" (`04-broadcasts-notifications-push.md:119`). Refactor it to
  return a `LucideIcon` (component, not pre-rendered JSX) so `IconBadge` can size
  it, and co-locate it with the row (or a small `apps/web/app/notifications/
  presentation-meta.ts`). It is shared with the S15 composer's
  `PresentationSelect`/`PresentationPill`; if both surfaces want one source, a
  **string-keyed** metadata map (icon **names**, no JSX) may live in
  `packages/types/src/announcement.ts` per the same service-plan note — but the
  JSX/`LucideIcon` resolution stays in the app/UI tier.
- **`formatRelativeTime(date, now?)`** — relative-time formatter ("Just now",
  "2d ago") replacing `toLocaleDateString()` per `09-notifications.md:212`/OQ1.
  This **is** a pure, framework-agnostic helper → a **`@camp404/core` candidate**
  (`@camp404/ui` and `apps/web` may both import `@camp404/core`, per
  `architecture.md:254,260`). Two acceptable implementations:
  1. Wrap `date-fns/formatDistanceToNow` (already a transitive dep — present in
     `apps/web/.next/required-server-files`; confirm it is a direct dependency
     before relying on it), exposed as a thin pure helper in
     `@camp404/core` (no `next/*`, no I/O — satisfies the core import rule).
  2. A hand-rolled pure `formatRelativeTime(date, now = new Date())` returning
     "Just now" / "{n}m ago" / "{n}h ago" / "{n}d ago" / date fallback — zero new
     dependency, trivially unit-testable, matches the board strings exactly.
  **Recommendation:** option 2 (hand-rolled in `@camp404/core`) — it removes the
  dependency question, is deterministic (inject `now` for tests), and renders the
  exact board vocabulary. The helper takes a `Date`/ISO and an injectable `now`;
  it is RSC-safe (called server-side in the row).

### Services / server-actions it calls

**None.** `NotificationRow` calls **no service function and no server action** —
it is a pure presentation `<li>` that receives one `InboxItem` as props. All data
access lives in the **surface** host (`page.tsx`):
- `listInbox(userId)` (`apps/web/lib/notifications.ts` → `broadcasts.ts:472`,
  REUSE) — snapshot fetch.
- `markRead(userId, ids)` (`broadcasts.ts:516`, REUSE) — side-effect stamp, fired
  before render.

Both are **REUSE, unchanged** (`04-broadcasts-notifications-push.md:95,104,236`).
The row never mutates; there is no per-row action, no expand, no dismiss
(`09-notifications.md:120`).

### Server-component vs "use client" split

**Server component (no `"use client"`).** `NotificationRow` is rendered inside the
RSC inbox page; it has zero interactivity, zero event handlers, zero hooks, and no
client state. It receives already-resolved primitives (strings + `Date` +
booleans) and emits static markup. `IconBadge` and `Badge` are presentational and
RSC-renderable (no client directive of their own). `formatRelativeTime` runs at
render time server-side. Keeping it a server component avoids shipping the row to
the client bundle and matches the page's `dynamic = "force-dynamic"` model. (One
caveat — see States: pure-server relative time is fixed at render; there is no
client tick. Acceptable for this read-only snapshot surface.)

---

## API & data flow

### Props (component contract)

The row receives the **fields of a single `InboxItem`** (not the whole envelope),
plus the precomputed `isNew` flag so the read/unread decision is made once by the
host at snapshot time (it is point-in-time per `09-notifications.md:170`):

```ts
import type { InboxItem } from "@/lib/notifications"; // type-only

interface NotificationRowProps {
  /** Presentation variant → drives the icon. */
  presentation: InboxItem["presentation"]; // "acknowledge" | "popup" | "feed"
  /** Notification title (Inter 14/600). */
  title: string;
  /** Body copy, plain text, whitespace-pre-wrap, no truncation. */
  body: string;
  /** Sender display name; null suppresses the entire attribution line. */
  senderName: string | null;
  /** True when readAt === null at snapshot time → unread styling + "New" pill. */
  isNew: boolean;
  /** Acknowledgement timestamp; presence flips the ack-status suffix. */
  acknowledgedAt: Date | null;
  /** Delivery creation time → relative timestamp. */
  createdAt: Date;
}
```

> The host may instead pass `item: InboxItem` + `isNew`. Either is acceptable;
> the flattened prop list above documents exactly which `InboxItem` fields the row
> reads (`presentation`, `title`, `body`, `senderName`, `acknowledgedAt`,
> `createdAt` — **not** `id`/`readAt`/`broadcastId`, which stay with the host).
> The component-library `Props` line (`presentation · title · body · senderName?
> · isNew · acknowledgedAt? · createdAt`) is the contract; match it.

### What it fetches vs receives

- **Fetches:** nothing. No data access, no fetch, no action.
- **Receives:** the resolved `InboxItem` fields above, from the parent map in
  `page.tsx` (`items.map(...)` post-`listInbox`/post-`markRead`).

### How state flows

1. `page.tsx` (RSC) gates (auth → invite), calls `listInbox(campUser.id)` to get
   the `items` snapshot, then `markRead(campUser.id, items.map(i => i.id))`.
2. For each item the host computes `isNew = item.readAt === null` **before**
   `markRead` mutates the DB (the snapshot captured pre-read state; `markRead`
   touches the DB rows, not the in-memory `items`).
3. The host maps each item into `<NotificationRow … isNew={isNew} />`.
4. The row renders deterministically — no internal state.

### Forms / actions / validation

**N/A.** Read-only surface; no forms, no inputs, no validation
(`09-notifications.md:81`).

---

## States

`NotificationRow` is a presentational row; most of the global matrix is owned by
the **surface** (the page), but the row honours the variants below. Documented per
the locked requirement (every state incl. the global matrix + gating).

### Row-intrinsic variants

| State | Trigger | Treatment |
|---|---|---|
| **Unread (New)** | `isNew === true` (`readAt === null` at snapshot) | Root: `border-primary/40 bg-accent/20` (canonical-token form of the current `bg-accent/20` + primary border; board `fill:#ff008c14 stroke:$primary` = `border-primary/40 bg-accent/20`). Renders the `<Badge tone="primary" variant="solid" size="xs">New</Badge>` pill beside the title. |
| **Read** | `isNew === false` | Root: plain `bg-card border-border` (board Rows 2/3 `fill:$card stroke:$border`); no pill. |
| **Ack — acknowledged** | `acknowledgedAt != null` (any presentation) | Attribution suffix `· acknowledged`. Precedence: ack wins over presentation (`09-notifications.md:172`). |
| **Ack — awaiting** | `presentation === "acknowledge"` AND `acknowledgedAt == null` | Attribution suffix `· awaiting acknowledgement`. |
| **Ack — none** | `presentation` is `feed`/`popup` and not acked | No suffix — bare `From {name}`. |
| **Attribution suppressed** | `senderName == null` | Entire attribution `<p>` omitted — **including** any ack-status hint (known edge: system `acknowledge` shows no hint, `09-notifications.md:171,220` OQ3). Do not change behaviour; flag is product-owned. |
| **Per-presentation icon** | `presentation` value | `acknowledge`→`Megaphone`, `popup`→`MessageSquare`, `feed`/fallback→`Bell` inside `IconBadge` (`09-notifications.md:42–46`). |

### Global state matrix (surface-owned; row's part noted)

| State | Where owned | Row behaviour |
|---|---|---|
| **Empty** (`items.length === 0`) | Surface renders `<EmptyState icon={BellOff} …>` ([`molecule-emptystate.md`](./molecule-emptystate.md)) | Row is **not rendered** (no item). |
| **Loading** | Surface (`dynamic = "force-dynamic"`; HTML withheld until `listInbox`+`markRead` resolve — no client spinner, `09-notifications.md:80`) | Row never renders in a loading state; it only mounts with resolved data. No skeleton variant. |
| **Error** | Surface / RSC error boundary | Row has no error state of its own (no fetch). A throwing `listInbox` bubbles to the route boundary. |
| **Submitting / pending** | Surface (`markRead` server side-effect, fire-before-render) | No in-row indicator; row reflects the post-snapshot `isNew` only. |
| **Success** | Surface (implicit — cleared bell badge on return home) | No per-row success affordance; no toast. |
| **Disabled** | N/A | Row carries no actionable control (static `<li>`); nothing to disable. |

### Gating (preview-but-locked / CaptainLock)

**Not applicable to this organism.** The inbox is member-facing — every rank sees
their own deliveries; there is **no rank gate** on this surface
(`09-notifications.md:93` "N/A — inbox is member-facing"). `NotificationRow` is
**not** a captain/rank surface, so it carries **no `CaptainLock` / preview-but-
locked** state. (Recorded explicitly to satisfy the matrix requirement: the
preview-but-locked pattern from the locked decisions lives on the S15
**announcements composer**, not here.) Auth + invite gating is enforced upstream
by the surface (`getAuthenticatedUserOrRedirect`, `hasCampAccess`); the documented
gate **asymmetry** — onboarding-incomplete / pending / rejected users still reach
the inbox — is surface behaviour, unchanged (`09-notifications.md:92,176`).

---

## Build steps

Ordered, with dependency prerequisites + acceptance + tests.

### Prerequisites (must land first)

1. **`IconBadge`** shipped to `@camp404/ui` and exported from the barrel
   ([`atom-iconbadge.md`](./atom-iconbadge.md) Steps 1–2). The row's icon circle
   depends on it. The `muted` tone needs no NEW status token (only `success`/
   `warning` do), so IconBadge's token prerequisite does **not** block this row.
2. **`Badge`** shipped to `@camp404/ui` and exported
   ([`atom-badge.md`](./atom-badge.md) Steps 1, 4). The row uses
   `tone="primary" variant="solid"` — primary is an existing token, so Badge's
   `success`/`warning` token prerequisite does **not** block this row.
3. **`formatRelativeTime`** available in `@camp404/core` (pure helper) — or a
   confirmed direct `date-fns` dependency if option 1 is chosen. Core must exist
   (created in architecture Phase 1, `architecture.md:398`) before importing from
   it; if core is not yet scaffolded, co-locate the helper in
   `apps/web/app/notifications/` and migrate later.
4. *(Services — already met, REUSE)* `listInbox` / `markRead` exist and are
   unchanged (`04-broadcasts-notifications-push.md:95`). No service work blocks
   this row.

### Step 1 — Add `formatRelativeTime` (core or app-local) + `presentationIcon` refactor

- Implement pure `formatRelativeTime(date, now?)` returning board strings ("Just
  now", "{n}m ago", "{n}h ago", "{n}d ago", date fallback for older).
- Refactor `presentationIcon` to return a `LucideIcon` **component** (not
  pre-rendered JSX) so `IconBadge` can size/center it; move it next to the row
  (e.g. `presentation-meta.ts`) or keep in the row module.
- **Acceptance:** `formatRelativeTime` is pure (no `next/*`, no I/O), deterministic
  with injected `now`; `presentationIcon("popup") === MessageSquare`, etc.
- **Tests:** unit (Vitest) for `formatRelativeTime` boundaries (0s→"Just now",
  90s→"1m ago", 25h→"1d ago", >N days→date) and `presentationIcon` mapping incl.
  fallback. These are pure → fast, no DB.

### Step 2 — Create `apps/web/app/notifications/notification-row.tsx`

- Server component (no `"use client"`). Export `NotificationRow` +
  `NotificationRowProps`.
- Root `<li>` with `cn(...)` applying the unread vs read token classes (no raw
  `var(--color-…)` forms; use `border-primary/40 bg-accent/20` / `bg-card
  border-border`, board-aligned).
- Compose `<IconBadge size="sm" shape="circle" tone="muted"
  icon={presentationIcon(presentation)} aria-hidden />`.
- Title `<h2>` (Inter 14/600 → `text-sm font-semibold`), conditional
  `<Badge tone="primary" variant="solid" size="xs">New</Badge>` when `isNew`.
- `<time>` rendering `formatRelativeTime(createdAt)` with a machine-readable
  `dateTime={createdAt.toISOString()}` attribute.
- Body `<p className="whitespace-pre-wrap text-sm text-muted-foreground">` (no
  truncation, no markdown — `09-notifications.md:173`).
- Attribution `<p>` rendered only when `senderName != null`, with the ack-suffix
  precedence logic (acknowledged > awaiting > none).
- **Acceptance:** unread row shows accent wash + primary border + "New" pill; read
  row plain card; icon circle present (no bare inline span); attribution
  suppressed when `senderName` null; no raw hex / no `var(--color-…)` verbose
  forms / no `dark:` utilities.

### Step 3 — Wire the row into the surface (`page.tsx`)

- Replace the inline `<li>` block (`page.tsx:57–101`) with
  `<NotificationRow key={item.id} {...} isNew={item.readAt === null} />`.
- Remove the now-extracted `presentationIcon` from `page.tsx`; import from the row
  module / meta.
- (Coordinated with the surface plan: also swap the back affordance for
  `DetailHeader` and the empty `<p>` for `EmptyState`, and reconcile `max-w-2xl`→
  standard column — those are **surface** steps tracked in
  `surfaces/09-notifications.md` / [`molecule-detailheader.md`](./molecule-detailheader.md)
  / [`molecule-emptystate.md`](./molecule-emptystate.md), listed here only as the
  containing-surface context.)
- **Acceptance:** `/notifications` renders newest-first rows; unread rows carry the
  pill; badge clears on return home (existing `countUnread`/`markRead` flow
  untouched); no behavioural regression vs the current page.

### Step 4 — Tests

- **Unit (RTL, server-renderable):** render `NotificationRow` with
  (a) unread+acknowledge → pill present, `Megaphone` icon, `· awaiting
  acknowledgement` when not acked; (b) read+feed → no pill, `Bell`, no suffix;
  (c) `acknowledgedAt` set → `· acknowledged` overrides presentation;
  (d) `senderName === null` → no attribution `<p>` at all (incl. no ack hint);
  (e) relative-time text rendered.
- **E2E (Playwright via `testStore`-seeded deliveries):** the surface-level
  assertions per `04-broadcasts-notifications-push.md:238` — unread renders New
  pill + accent, read plain, ack-suffix preserved, badge clears on return home,
  null-`senderName` suppresses attribution. No new service test (REUSE-only data
  layer).
- **Acceptance:** unit + E2E green; `pnpm lint`/`tsc` clean; no raw hex.

---

## Consumers

| Surface | Mount | Spec |
|---|---|---|
| **Notifications inbox** | `apps/web/app/notifications/page.tsx` — one `NotificationRow` per `InboxItem` inside the `<ul>`, newest-first | [`surfaces/09-notifications.md`](../../surfaces/09-notifications.md) (board `21-s12-notifications`) |

This is the **sole consumer** — the component-library entry lists "Used by:
notifications inbox" only. The row is not reused by any other surface (its sibling
list-row organisms `RosterRow` / `TreeRow` are deliberately distinct anatomies per
`component-library.md:473`). `popup`-presentation deliveries also appear in this
list via the same row (they land in `listInbox`); whether `popup` additionally
gets a transient renderer elsewhere is an open product question
(`04-broadcasts-notifications-push.md:110,252`) that does not change this row.
