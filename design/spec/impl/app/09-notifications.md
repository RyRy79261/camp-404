# 09-notifications — app integration plan

- **Route:** `/notifications` · server-rendered page (RSC, `dynamic = "force-dynamic"`)
- **Surface spec:** [`design/spec/surfaces/09-notifications.md`](../../../spec/surfaces/09-notifications.md)
- **Board:** `21-s12-notifications` (430px mobile-only, single column)
- **Gating:** auth + invite only (no rank gate; member-facing)

---

## Current state — the existing route/files today

### Confirmed files (verified by read)

| File | Status | Notes |
|---|---|---|
| `apps/web/app/notifications/page.tsx` | EXISTS — the single file in the route dir | RSC, `dynamic = "force-dynamic"`, `export const metadata = { title: "Notifications — Camp 404" }` |
| `apps/web/lib/notifications.ts` | EXISTS — `"server-only"` facade | Re-exports `listInbox`, `markRead`, `countUnread`, `getPendingAcknowledgements`, `acknowledgeDelivery`, plus the announcement draft/publish set. Wraps the real `@camp404/db/broadcasts` backend with an in-memory `testStore` behind `isE2ETestMode()`. |
| `apps/web/app/home-header.tsx` | EXISTS | `HomeHeader` component — bell icon links to `/notifications`, renders the `"99+"` badge. |

No `notification-row.tsx`, no `presentation-meta.ts`, no layout, no error/not-found boundaries, no server actions, no API route handlers — the route is a single `page.tsx`.

### What the current page does

`page.tsx` (108 lines):

1. **Gate:** `getAuthenticatedUserOrRedirect()` → `ensureCampUser()` → `hasCampAccess()` → redirect `/signup/required`.
2. **Data:** `listInbox(campUser.id)` snapshot, then `markRead(campUser.id, ids)`.
3. **Render:** `<main className="mx-auto max-w-2xl px-6 py-10">` — layout drift (`max-w-2xl` vs the product `max-w-lg` shell used on other surfaces).
4. **Back affordance:** `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5"><a href="/"><ChevronLeft h-4 w-4 /> Home</a></Button>` — ghost rectangle, not the board's 40×40 round `$muted` pill. No `DetailHeader`.
5. **Header block:** `<h1 className="text-2xl font-semibold">Notifications</h1>` + subtitle `<p>`.
6. **Empty state:** plain `<p className="text-sm text-muted-foreground">No notifications yet.</p>` — no icon circle, no `BellOff`, does not match the board's `full` `EmptyState` anatomy.
7. **Row list:** inline `<ul>` / `<li>` map — `presentationIcon()` helper and all row chrome are inline in the page module. Key gaps vs board:
   - `presentationIcon` returns pre-rendered JSX (not a `LucideIcon` component); no `IconBadge` circle — just a bare `<span className="text-muted-foreground">`.
   - Timestamp: `new Date(item.createdAt).toLocaleDateString()` (date-only) — board shows relative ("2d ago", "Just now").
   - Unread styling uses raw `var()` tokens: `border-[color:var(--color-primary)]/40 bg-accent/20` — should be canonical `border-primary/40 bg-accent/20`.
   - "New" pill uses raw `var()`: `bg-[color:var(--color-primary)] … text-[color:var(--color-primary-foreground)]` — should become `<Badge tone="primary" variant="solid" size="xs">New</Badge>`.
   - `presentationIcon()` inline in page module; should move to `notification-row.tsx` / `presentation-meta.ts`.

### What the redesign changes

| Area | Current | Target |
|---|---|---|
| Back affordance | Ghost `<Button>` rectangle wrapping `<a href="/">` | `<DetailHeader title="Home" backHref="/" />` (round 40×40 pill, board-spec) |
| Container width | `max-w-2xl px-6 py-10` | Standard shell width (`max-w-lg` or the product-wide column — see Open items #1) |
| Empty state | Plain `<p>` | `<EmptyState variant="full" icon={BellOff} heading="No notifications yet." body="Everything sent your way will appear here." />` with `className="py-10 px-6"` per board `pad:[40,24]` |
| Row | Inline `<li>` in `page.tsx` (L57–101) | `<NotificationRow>` organism extracted to `notification-row.tsx`; `IconBadge` icon circle; `Badge` New pill; `formatRelativeTime` timestamps |
| `presentationIcon` | Inline in `page.tsx`, returns JSX | Refactored to return `LucideIcon` component; co-located with `notification-row.tsx` (or `presentation-meta.ts`) |
| Token form | Raw `var(--color-…)` throughout | Canonical Tailwind token utilities (`border-primary/40`, `bg-accent/20`, etc.) |
| Timestamp format | `toLocaleDateString()` (date-only) | `formatRelativeTime(createdAt)` ("Just now", "2d ago", etc.) |
| `<ChevronLeft>` import | Present (ghost button) | Removed after `DetailHeader` ships |

Service layer (`lib/notifications.ts`, `listInbox`, `markRead`) and all auth gates are **REUSE — unchanged**.

---

## File structure — target files in apps/web

| File | vs Current | Classification |
|---|---|---|
| `apps/web/app/notifications/page.tsx` | Exists — single file today | MODIFY |
| `apps/web/app/notifications/notification-row.tsx` | Does not exist | CREATE |
| `apps/web/app/notifications/presentation-meta.ts` | Does not exist | CREATE (pure helper; may be inlined in `notification-row.tsx` if preferred) |

No new layout, no `error.tsx`, no `not-found.tsx`, no `loading.tsx`, no server actions, no `/api` route handlers. The surface is read-only, RSC, and server-gated.

### No new layout

The notifications route inherits the root layout (`apps/web/app/layout.tsx`), which mounts the `acknowledgement-gate.tsx` overlay. No surface-specific layout is needed or drawn.

### No client components

`page.tsx` stays a pure server component (RSC). `notification-row.tsx` is also a server component — it has zero interactivity, zero hooks, no event handlers (see organism plan). No `"use client"` file is introduced by this surface.

### No server actions

The only mutation is `markRead` — fired inline in the RSC body before render, not from a client action. No `actions.ts` file.

### No API route handlers

The existing handlers (`/api/notifications/acknowledge`, `/api/notifications/pending`) serve the acknowledgement-gate overlay, not this surface. This surface introduces no new route handlers.

---

## Components composed — target composition with links

All component plans are in `design/spec/impl/components/`.

| Component | Plan | Home | Where rendered | Classification |
|---|---|---|---|---|
| `DetailHeader` | [`molecule-detailheader.md`](../components/molecule-detailheader.md) | `@camp404/ui` (PROMOTE) | Top of `page.tsx` `<main>` — server | REUSE after DetailHeader ships; replaces the current ghost Button |
| `NotificationRow` | [`organism-notificationrow.md`](../components/organism-notificationrow.md) | `apps/web/app/notifications/notification-row.tsx` (NEW, app-local) | Inside `<ul>` map in `page.tsx` — server | NEW |
| `EmptyState` | [`molecule-emptystate.md`](../components/molecule-emptystate.md) | `@camp404/ui` (PROMOTE) | Conditional branch in `page.tsx` when `items.length === 0` — server | REUSE after EmptyState ships; replaces plain `<p>` |
| `IconBadge` | [`atom-iconbadge.md`](../components/atom-iconbadge.md) | `@camp404/ui` (PROMOTE) | Inside `NotificationRow` — server | Consumed by NotificationRow; not imported directly by `page.tsx` |
| `Badge` | [`atom-badge.md`](../components/atom-badge.md) | `@camp404/ui` (PROMOTE) | Inside `NotificationRow` (the "New" pill) — server | Consumed by NotificationRow; not imported directly by `page.tsx` |
| `HomeHeader` | `apps/web/app/home-header.tsx` (EXISTS) | app-local | Entry point — rendered by `apps/web/app/page.tsx`; links to `/notifications`; not part of this surface's own page | REUSE unchanged |

No shadcn primitives introduced by this surface. The existing `Button` import in `page.tsx` is DELETED once `DetailHeader` absorbs the back affordance.

---

## Services & data — service-layer functions and data flow

All service-layer functions are **REUSE — no changes to the service layer**.

### Server-side data flow (all in `page.tsx` RSC body)

```
1. getAuthenticatedUserOrRedirect()  →  apps/web/lib/auth.ts        REUSE
2. ensureCampUser(authUser)          →  apps/web/lib/users.ts        REUSE
3. hasCampAccess(campUser, email)    →  apps/web/lib/users.ts        REUSE  (pure; @camp404/core extraction candidate — architecture Phase 3)
4. listInbox(campUser.id)            →  apps/web/lib/notifications.ts → @camp404/db/broadcasts  REUSE
5. markRead(campUser.id, ids)        →  apps/web/lib/notifications.ts → @camp404/db/broadcasts  REUSE
```

Steps 1–5 all run server-side before any HTML is returned. The page is `dynamic = "force-dynamic"` — no caching; fresh on every request.

### Props vs fetched

- `page.tsx` fetches everything server-side; the resolved `InboxItem[]` array is passed directly into the JSX map.
- `NotificationRow` receives per-row props only (no data access, no fetch). See organism plan for the props interface.
- `isNew = item.readAt === null` is computed in the `page.tsx` map **before** `markRead` mutates the DB (snapshot semantics: `markRead` touches DB rows; the in-memory `items` array reflects the pre-read state). This is the point-in-time `isNew` flag passed to each row.

### E2E_TEST_MODE seam

`lib/notifications.ts` routes `listInbox` and `markRead` through `testStore` when `isE2ETestMode()` returns true (`E2E_TEST_MODE=1`). `testStore.listInbox` and `testStore.markRead` are implemented (verified at `apps/web/lib/test-store.ts:514,547`). No change needed — the seam is live.

### `@camp404/core` dependency (future)

`formatRelativeTime` — the relative-time helper used by `NotificationRow` — is a pure, framework-agnostic function with no `next/*` / no I/O. The organism plan nominates it as a `@camp404/core` candidate. If `@camp404/core` (architecture Phase 1) is not yet scaffolded when this surface is built, co-locate the helper in `apps/web/app/notifications/` and migrate the import once `core` exists. The surface plan does not block on `@camp404/core` being live.

---

## Gating

### Gate levels applied

| Gate | Implementation | Treatment |
|---|---|---|
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` in RSC body | Redirect to auth (Next.js `redirect()` from `next/navigation`) |
| **Invite / camp-access** | `hasCampAccess(campUser, authUser.primaryEmail)` | Redirect `/signup/required` when false; passes for `isGodEmail` OR non-null `inviteCode` |
| **Onboarding-incomplete / pending-approval / rejected** | Not enforced on this route | Gate asymmetry: such users reach the inbox (matches live code; intentional — `09-notifications.md:92,176`) |

### No rank gate / no CaptainLock

The notifications inbox is member-facing. Every rank (member, team_lead, captain) sees their own deliveries. There is **no captain-only rank gate**, no preview-but-locked treatment, and no `CaptainLock` organism on this surface. (`09-notifications.md:93` confirms: "N/A — inbox is member-facing; every rank sees their own deliveries; no rank gate".) The `requireClearance` / `CaptainLock` pattern from architecture Decision 3 does not apply here.

---

## States

| State | Trigger | Treatment |
|---|---|---|
| **Loading** | Page awaiting `listInbox` + `markRead` (RSC `force-dynamic`) | No client spinner; HTML not returned until both calls resolve. No `loading.tsx` / `<Suspense>` — the RSC is synchronous until data resolves. |
| **Populated** | `items.length > 0` | `<ul>` of `<NotificationRow>` elements, newest-first (`createdAt DESC` from `listInbox`). |
| **Empty** | `items.length === 0` | `<EmptyState variant="full" icon={BellOff} heading="No notifications yet." body="Everything sent your way will appear here." className="py-10 px-6" />`. No list rendered. |
| **Error** | `listInbox` throws or network error | Bubbles to root RSC error boundary (`apps/web/app/error.tsx` if present, else Next.js default). No surface-specific `error.tsx`. |
| **Submitting / pending** | `markRead` side effect | Server-side, fires in RSC body before render; no in-page indicator. |
| **Success (implicit)** | Page renders | The cleared bell badge on return to home (`countUnread` recomputed on next home load) is the success signal. No toast raised. |
| **Disabled** | N/A | No actionable controls on this surface (back nav link is not a form control). |
| **Unauthenticated** | No session | `redirect()` before render — page never rendered. |
| **No camp access** | `!hasCampAccess(...)` | `redirect("/signup/required")` — page never rendered. |

### Row-level variants (owned by NotificationRow — summarised here for surface completeness)

| Variant | Condition | Visual |
|---|---|---|
| **Unread (New)** | `isNew === true` (`readAt === null` at snapshot) | `border-primary/40 bg-accent/20`; `<Badge tone="primary" variant="solid" size="xs">New</Badge>` beside title |
| **Read** | `isNew === false` | `bg-card border-border`; no pill |
| **Ack — acknowledged** | `acknowledgedAt != null` | Attribution suffix `· acknowledged` (wins over presentation value) |
| **Ack — awaiting** | `presentation === "acknowledge"` AND `acknowledgedAt == null` | Attribution suffix `· awaiting acknowledgement` |
| **Ack — none** | `presentation` is `feed`/`popup`, not acked | No suffix |
| **Attribution suppressed** | `senderName == null` | Entire attribution `<p>` omitted, including ack suffix hint (system delivery / deleted sender — known edge case OQ3) |

---

## Build steps — ordered with prerequisites and acceptance criteria

Each step is independently CI-green per the MEMORY constraint. Steps 1–3 land in prerequisite order; step 4 is the surface integration; step 5 closes with tests.

### Prerequisites that must land before step 4

The following component/service deliverables from other plans are required before the surface can be fully wired:

| Prerequisite | Plan | Why needed |
|---|---|---|
| `IconBadge` shipped to `@camp404/ui` | [`atom-iconbadge.md`](../components/atom-iconbadge.md) | `NotificationRow` uses `<IconBadge size="sm" shape="circle" tone="muted">` for the presentation icon circle |
| `Badge` shipped to `@camp404/ui` | [`atom-badge.md`](../components/atom-badge.md) | `NotificationRow` uses `<Badge tone="primary" variant="solid" size="xs">New</Badge>` |
| `DetailHeader` shipped to `@camp404/ui` | [`molecule-detailheader.md`](../components/molecule-detailheader.md) | Replaces the current ghost `Button` back affordance |
| `EmptyState` shipped to `@camp404/ui` | [`molecule-emptystate.md`](../components/molecule-emptystate.md) | Replaces the current plain-`<p>` empty state |
| `formatRelativeTime` available in `@camp404/core` (or co-located) | [`organism-notificationrow.md`](../components/organism-notificationrow.md) Step 1 | `NotificationRow` timestamp; if `@camp404/core` not yet scaffolded, co-locate in `apps/web/app/notifications/` |

Service layer (`listInbox`, `markRead`, `lib/notifications.ts`) is REUSE — already met.

---

### Step 1 — `formatRelativeTime` + `presentationIcon` refactor

**Prerequisite:** none. This step is standalone and can land before atom components ship.

- Implement pure `formatRelativeTime(date: Date, now?: Date): string` returning "Just now" / "{n}m ago" / "{n}h ago" / "{n}d ago" / locale date fallback for older (matching board strings). Deterministic with injected `now` for test isolation.
- Refactor `presentationIcon` (currently at `page.tsx:L18–22`) to return a `LucideIcon` **component** (not pre-rendered JSX) so `IconBadge` can receive it as a prop.
- Location: place both in `apps/web/app/notifications/presentation-meta.ts` (or inline in `notification-row.tsx`) until `@camp404/core` is scaffolded; migrate the `formatRelativeTime` import once `core` exists.
- **Acceptance:** `formatRelativeTime` is a pure function (no `next/*`, no I/O); `presentationIcon("popup")` returns the `MessageSquare` component (not JSX); `presentationIcon("unknown")` returns `Bell` (fallback). Unit tests cover the boundary cases.
- **Tests:** Vitest unit — `formatRelativeTime` boundaries (0 s → "Just now", 90 s → "1m ago", 25 h → "1d ago", > threshold → locale date); `presentationIcon` map including fallback.

---

### Step 2 — Create `apps/web/app/notifications/notification-row.tsx`

**Prerequisite:** Step 1 (the `formatRelativeTime` / `presentationIcon` refactor). `IconBadge` and `Badge` must be available in `@camp404/ui`; if they have not yet shipped, use inline equivalents and swap once they land (keep as a tracked TODO, one atomic change per component landing).

Full spec: [`organism-notificationrow.md`](../components/organism-notificationrow.md). Summary of the file's contract:

- Server component (no `"use client"`).
- Exports `NotificationRow` + `NotificationRowProps`.
- Props: `presentation`, `title`, `body`, `senderName: string | null`, `isNew: boolean`, `acknowledgedAt: Date | null`, `createdAt: Date`.
- Root `<li>`: `cn(…)` with `border-primary/40 bg-accent/20` when `isNew`, otherwise `bg-card border-border`. No raw `var(--color-…)` forms.
- `<IconBadge size="sm" shape="circle" tone="muted" icon={presentationIcon(presentation)} aria-hidden />` (40×40 icon circle per board).
- Title `<h2 className="text-sm font-semibold leading-tight">` + conditional `<Badge tone="primary" variant="solid" size="xs">New</Badge>` when `isNew`.
- `<time dateTime={createdAt.toISOString()} className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(createdAt)}</time>`.
- Body `<p className="whitespace-pre-wrap text-sm text-muted-foreground">` — no truncation, no markdown.
- Attribution `<p>` only when `senderName != null`; ack-suffix precedence: `acknowledgedAt` set → `· acknowledged`; `presentation === "acknowledge"` && not acked → `· awaiting acknowledgement`; else bare `From {senderName}`.
- **Acceptance:** unread row: accent wash + primary border + pill; read row: plain card; icon circle present (no bare `<span>`); attribution suppressed when `senderName` null; no raw hex; no `dark:` utilities; no `var(--color-…)` verbose forms; `tsc` clean.

---

### Step 3 — Create `presentation-meta.ts` (if not inlined in Step 2)

If `presentationIcon` is not inlined in `notification-row.tsx`, place it in `apps/web/app/notifications/presentation-meta.ts`. The file exports a `LucideIcon`-returning helper and optionally a `PRESENTATION_META` record (icon name + aria label) if S15 Announcements composer wants to share a string-keyed map (no JSX). See [`04-broadcasts-notifications-push.md`](../service-layer/04-broadcasts-notifications-push.md) §Types note on `PresentationMeta` being optional.

**Acceptance:** helper module compiles; the `NotificationRow` import resolves cleanly.

---

### Step 4 — Modify `apps/web/app/notifications/page.tsx`

**Prerequisite:** Steps 1–3 complete. `DetailHeader`, `EmptyState` available in `@camp404/ui`.

Changes:

1. **Container width:** change `max-w-2xl px-6 py-10` to the standard product shell (see Open items #1 — confirm the canonical width before merging).
2. **Back affordance:** remove lines 41–45 (the `Button asChild` / `<a href="/">` / `ChevronLeft` block). Import `DetailHeader` from `@camp404/ui`. Render `<DetailHeader title="Home" backHref="/" />` at the top of `<main>`, before the existing `<header>` block. Remove the now-unused `ChevronLeft` and `Button` imports.
3. **Empty state:** replace `<p className="text-sm text-muted-foreground">No notifications yet.</p>` with `<EmptyState variant="full" icon={BellOff} heading="No notifications yet." body="Everything sent your way will appear here." className="py-10 px-6" />`. Add `BellOff` to lucide imports (or confirm it is already present).
4. **Row list:** replace the inline `<li>` block (lines 57–101) with `<NotificationRow key={item.id} isNew={item.readAt === null} presentation={item.presentation} title={item.title} body={item.body} senderName={item.senderName} acknowledgedAt={item.acknowledgedAt} createdAt={item.createdAt} />`.
5. **Remove inline `presentationIcon`:** delete lines 18–22 from `page.tsx`; import the helper from `notification-row.tsx` or `presentation-meta.ts` if it needs to be called at the page level (it does not — the row owns it). Remove `Megaphone`, `MessageSquare`, `Bell` imports from the page if `NotificationRow` consumes them internally.
6. **Token cleanup:** no raw `var()` forms should remain in `page.tsx` after the above changes.

Preserved unchanged:

- `export const dynamic = "force-dynamic"` — keep.
- `export const metadata` — keep.
- Auth + invite gates (lines 25–29) — REUSE exactly.
- `listInbox` + `markRead` calls (lines 33–37) — REUSE exactly; `isNew = item.readAt === null` computed before `markRead` mutates DB.
- `lib/notifications` import — keep.

**Acceptance:** page renders `DetailHeader` with round back-pill labelled "Home"; back nav goes to `/`; populated state renders `NotificationRow` list newest-first with unread pill + accent styling; empty state renders bell-off circle + heading; bell badge clears on return to home (existing `countUnread`/`markRead` flow unchanged); no ghost `Button` remains; no raw `var(--color-…)` in the page file; `tsc` clean; `pnpm build` green on `apps/web`.

---

### Step 5 — Tests

**Unit (RTL, server-renderable) for `NotificationRow`:**

| Case | Assertion |
|---|---|
| Unread + acknowledge + no acknowledgedAt | Pill `New` present; `Megaphone` icon; `· awaiting acknowledgement` suffix |
| Read + feed | No pill; `Bell` icon; no attribution suffix |
| `acknowledgedAt` set | `· acknowledged` wins over `presentation` value |
| `senderName === null` | No attribution `<p>` rendered; no ack hint |
| `presentation === "popup"` | `MessageSquare` icon |
| Relative time rendered | `<time>` element contains relative string (not a date string) |

**Unit for `formatRelativeTime` and `presentationIcon`:** covered in Step 1.

**E2E (Playwright via `testStore`-seeded deliveries):**

- Seed an unread `acknowledge` delivery for the test user via `testStore` (the `isE2ETestMode()` / `E2E_TEST_MODE=1` path). Navigate to `/notifications`. Assert: row renders with "New" pill + accent border + `· awaiting acknowledgement`. Assert: on return to home, bell badge count drops (markRead stamped).
- Seed a read `feed` delivery. Assert: plain card border, no pill, no attribution.
- Seed a delivery with `senderName === null`. Assert: no attribution line.
- Empty state: no deliveries for the user. Navigate to `/notifications`. Assert: `EmptyState` icon circle + "No notifications yet." heading visible; no `<ul>` rendered.

No new service test — the service layer is REUSE-only. The `testStore` seam is already live.

**Acceptance:** unit + E2E pass; `pnpm lint` / `tsc` clean; no raw hex; no `dark:` utilities anywhere in the new files.

---

## Open items — surface-specific decisions

These cross-reference `design/spec/surfaces/09-notifications.md §Open questions / build reconciliations`.

| # | Item | Spec ref | Action needed |
|---|---|---|---|
| 1 | **Container width (`max-w-2xl` drift).** Live code uses `max-w-2xl px-6 py-10`; board is 430px mobile-only; other surfaces use `max-w-lg`. Reconcile to the product-standard shell during Step 4, or confirm a wider notifications column is a deliberate product decision. | `09-notifications.md` Divergences §2 | **Owner: product / lead architect.** Must be locked before Step 4 merges. |
| 2 | **Relative vs absolute timestamps.** Board shows "Just now", "2d ago", "3d ago"; live code uses `toLocaleDateString()`. The plan adopts relative time (Step 1 / Step 2). Confirm the threshold at which it falls back to a locale date (e.g. > 7 days, > 30 days). | `09-notifications.md` OQ1 | **Owner: product.** Implement `formatRelativeTime` with a reasonable default threshold; adjust after review. |
| 3 | **System `acknowledge` delivery with null `senderName`.** A system-generated `acknowledge` delivery (null `broadcastId` / null `senderId`) suppresses the entire attribution line — including the "· awaiting acknowledgement" hint — so the user has no inline prompt to complete the acknowledgement. Confirm whether this is a real scenario; if so, consider showing `· awaiting acknowledgement` without a `From` prefix. | `09-notifications.md` OQ3 | **Owner: product.** Current behaviour (suppress all) is preserved as-is; a future change is a `NotificationRow` prop tweak. |
| 4 | **Pagination / list length.** `listInbox` returns all deliveries with no LIMIT. For long-lived accounts this can grow unboundedly. Current design: no pagination, no virtual scroll, no cap. Confirm whether a hard cap (e.g. last 50) or client-side virtual list is wanted; if so, a `listInbox` signature change is needed in `@camp404/db/broadcasts`. | `09-notifications.md` OQ4 | **Owner: product.** Out of scope for this pass unless explicitly requested. |
| 5 | **`refType` / `refId` deep-link.** `notification_deliveries` carries `refType` and `refId` for deep-linking, but `InboxItem` omits them and rows are static `<li>` elements. Confirm whether per-row tap navigation is permanently deferred or in-scope for a near-term follow-up. If in scope, `InboxItem` needs `refType`/`refId` added and `NotificationRow` needs a wrapping link. | `09-notifications.md` OQ5 | **Owner: product.** No change to this surface until confirmed. |
| 6 | **Gate asymmetry (onboarding / pending / rejected).** Users who have redeemed an invite code but have not completed onboarding, or whose approval is pending/rejected, currently reach the inbox. This is intentional in live code. Confirm as a product decision. | `09-notifications.md` OQ6 | **Owner: product.** No code change unless the decision reverses. |
| 7 | **`formatRelativeTime` location before `@camp404/core` exists.** Step 1 proposes co-locating in `apps/web/app/notifications/` until `@camp404/core` (architecture Phase 1) is scaffolded. Once `core` exists, migrate the helper and update the import. Ensure the migration lands as an independent, CI-green change (MEMORY: green-CI-is-done). | `architecture.md` Phase 1 | **Owner: impl engineer.** Track as a follow-up task against the `core` scaffold step. |
| 8 | **`DetailHeader` title override.** The board shows `overrides: ["Home"]` on the `DetailHeader` instance — meaning the back button label reads "Home". The `molecule-detailheader.md` plan wires this as `<DetailHeader title="Home" backHref="/" />`. Confirm the visual: the title string inside `DetailHeader` is the back-destination name ("Home"), not the surface name ("Notifications"). The surface `<h1>` below is the page title "Notifications". | `molecule-detailheader.md` Step 5 | **Owner: design (confirm label intent).** Low-risk; noted for clarity. |
