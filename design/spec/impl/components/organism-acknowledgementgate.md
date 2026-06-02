# AcknowledgementGate — organism plan

- **mapsTo:** REUSE (EXTEND, presentation-only) — keep `AcknowledgementGate`, **app-local** (`apps/web`), NOT promoted to `packages/ui`. Per `component-library.md` ("mapsTo: keep `AcknowledgementGate` (app)") and the S25 brief / service-layer plan 04, which mount it from the root layout and have it self-fetch via app routes. It is a `"use client"` component that calls `next/navigation` + app `/api/**` routes, so it cannot live in `@camp404/ui` (layering rule: `@camp404/ui` may import `types`+`core`, **never** `next/*`).
- **Target file path:** `apps/web/app/acknowledgement-gate.tsx` (existing; restyle in place — no move, no rename).
- **Tier:** organism (a.k.a. **AckTakeover** in the S25 brief — same component).
- **Classification of the work:** EXTEND. Logic, polling, de-race, scroll lock, and the POST flow are **kept verbatim**. The delta is **presentation only** (header treatment, scan overlay, reassurance line, tokenised colours) plus an internal swap of the inline `Loader2` for the promoted `Spinner` atom and the inline `Megaphone` chip for the promoted `IconBadge` atom. **Drop no functionality.**

---

## Current state — what exists today (the old design's component/route markup)

The component **exists and works**. It is not new.

- **`apps/web/app/acknowledgement-gate.tsx`** (the whole organism, `"use client"`):
  - `POLL_INTERVAL_MS = 45_000` (`:26`). State: `queue: PendingItem[]`, `acking: boolean`, `scrollRef`, monotonic `requestIdRef` (`:30-35`).
  - `PendingItem` client mirror (`:18-24`): `{ deliveryId; title; body; senderName: string | null; createdAt: string }` (`createdAt` is JSON string, not `Date`).
  - `load()` (`:37-50`): `fetch("/api/notifications/pending", { cache: "no-store" })`; non-ok → silent return; monotonic `requestId` guard drops superseded responses (`:45`); sets `queue`.
  - Poll wiring (`:54-67`): initial load + `setInterval(POLL_INTERVAL_MS)` + `visibilitychange` + `window focus` refetch; all torn down on unmount.
  - `current = queue[0]` (`:69`). Body scroll-lock effect (`:73-81`): saves the **previous** `body.style.overflow` and restores it (not hard-coded `""`), resets `scrollRef` to top when a new item surfaces. `if (!current) return null` (`:83`) — the empty/common case renders nothing.
  - `acknowledge()` (`:85-103`): `setAcking(true)` → POST `/api/notifications/acknowledge {deliveryId}` → non-ok silent no-op → on ok: bump `requestIdRef` (so an in-flight poll can't re-add the dismissed item), filter the item out of `queue`, `router.refresh()`; `finally setAcking(false)`.
  - Markup (`:105-156`): `role="dialog" aria-modal="true" aria-labelledby="ack-title"`, `fixed inset-0 z-[100] bg-[color:var(--color-background)]`; inner scroll column `mx-auto … max-w-2xl … overflow-y-auto px-6 py-10`; **header chip** = inline `Megaphone` (`h-5 w-5`) + uppercase mono-ish label "Camp announcement"; `<h1 id="ack-title">` title; meta `From {senderName} · {createdAt.toLocaleString()}` (prefix omitted when `senderName` null); body `whitespace-pre-wrap`; **footer at END of scroll** (not pinned) with `{queue.length - 1} more after this.` when `queue.length > 1`, then full-width `Button size="lg"` with inline `{acking && <Loader2 className="h-4 w-4 animate-spin" />}` + "Acknowledge".

- **Mount:** `apps/web/app/layout.tsx:52` — `<AcknowledgementGate />` rendered once inside `<Providers>`, after `{children}`, alongside `<FeedbackGate>`. App-wide, route-independent.

- **Server routes it calls (exist, REUSE):**
  - **`apps/web/app/api/notifications/pending/route.ts`** (GET, `runtime="nodejs"`, `dynamic="force-dynamic"`): anon → `{ pending: [] }` (NOT 401 — gate mounts on public pages); signed-in but no camp access (`!hasCampAccess`) → `{ pending: [] }` (avoids querying with the synthetic empty id); else `getPendingAcknowledgements(campUser.id)` → `{ pending }`.
  - **`apps/web/app/api/notifications/acknowledge/route.ts`** (POST, `runtime="nodejs"`): `Body = z.object({ deliveryId: z.string().uuid() })`; anon → 401; bad body → 400; no camp access → `{ ok: false }`; else `acknowledgeDelivery({ deliveryId, userId: campUser.id })` → `{ ok }`.

- **Service layer it consumes (exist, REUSE, no change — service-layer plan 04):**
  - `getPendingAcknowledgements(userId) → PendingAcknowledgement[]` and `acknowledgeDelivery({deliveryId,userId}) → boolean`, via the `apps/web/lib/notifications.ts` `"server-only"` facade (real-vs-test backend split) over `@camp404/db/broadcasts`.
  - DB types: `PendingAcknowledgement = { deliveryId; title; body; senderName: string | null; createdAt: Date }`. Reads `notification_deliveries` filtered to `presentation='acknowledge' AND acknowledgedAt IS NULL`, ordered `createdAt` (oldest-first), joined to `broadcasts → users.displayName` for `senderName`. Acknowledge stamps `{acknowledgedAt: now, readAt: now}` owner- AND presentation-scoped. Index `notification_deliveries_user_ack_idx` on `(userId, acknowledgedAt)` is the exact gate predicate.

**Gap vs spec (presentation only):** the S25 board draws (a) a `60×60` **`primary/18%` icon disc** ("AckTakeover `ic`" — see `atom-iconbadge.md`) rather than a bare inline `Megaphone`; the brief however describes a **header chip** (`Megaphone` + mono "CAMP ANNOUNCEMENT" label) — both are documented; resolve below; (b) a decorative `#00dcff08` **scanline overlay**; (c) the **reassurance line** "You can't dismiss this until you acknowledge." beneath the button. The inline `Loader2`/`Megaphone` should be replaced by the promoted `Spinner`/`IconBadge` atoms. The verbose `bg-[color:var(--color-background)]` should normalise to the short-form `bg-background` token. No logic changes.

---

## Composition — leaves, core helpers, services, RSC vs client split

### Render split
- **Client component only** (`"use client"`). There is **no server-component half** — the organism self-fetches over `fetch()` from the browser (it must poll on an interval + on focus, and mounts on public pages where there is no per-route server fetch). The **server work lives in the two route handlers** (`pending` GET, `acknowledge` POST), which are the RSC/Node side of the boundary. The component is mounted by the (server) root layout but is itself a client island.

### Leaf components it consumes (link plan files)
- **Button** (atom · REUSE) — `design/spec/impl/components/atom-button.md`. The full-width Acknowledge CTA: `variant="default"` (primary), `size="lg"`, `disabled={acking}`, children = `<Spinner …/> + "Acknowledge"`. Button owns no `loading` prop — the consumer-owned loading pattern (disabled + Spinner child) is exactly what this organism uses (atom-button.md §States, and it is listed there as a Button consumer).
- **Spinner** (atom · PROMOTE) — `design/spec/impl/components/atom-spinner.md`. Replaces the inline `<Loader2 className="h-4 w-4 animate-spin" />` (atom-spinner.md explicitly absorbs `acknowledgement-gate.tsx:150`). Use `<Spinner size="sm" variant="inline" aria-hidden />` inside the Button's `acking` branch (the Button supplies the accessible name; spinner is decorative).
- **IconBadge** (atom · PROMOTE) — `design/spec/impl/components/atom-iconbadge.md`. The atom plan lists the **AckTakeover `ic` (60×60 `r:999`, `primary/18%`)** as a board instance that becomes `IconBadge` once built. Use it for the header treatment: `IconBadge` with the `Megaphone` icon, size `lg` (60 px), tint `primary` (`primary/18%`). The mono "CAMP ANNOUNCEMENT" eyebrow stays a sibling label. (Reconciliation: the brief's "header chip" and the board's "icon disc" are the same affordance; render the `IconBadge` disc + mono eyebrow — see States/build notes.)

### `@camp404/core` helpers
- **None required.** The component carries no business logic to extract: time is rendered with the browser-native `new Date(current.createdAt).toLocaleString()` (absolute local time — the S25 brief confirms "`createdAt` localised via `toLocaleString()`"; this is NOT the relative-time formatter the S09 inbox uses, so no `formatDistanceToNow` helper is pulled in here). The auth/access gating (`hasCampAccess`) lives **server-side in the route handlers**, not in this client component — and the architecture moves `hasCampAccess` into `@camp404/core` (consumed by `apps/web/lib/users.ts` as a thin shim), so the **routes** transitively depend on `core`, not the client gate.
- No `rankLevel`/`requireClearance`/CaptainLock — this is a **member-level** surface, not a captain/rank surface (S25 §Gating: "Preview-but-locked — not applicable; all five overlays are member-level").

### Services / server-actions it calls (named, from service-layer plan 04)
- `getPendingAcknowledgements(userId)` — via `apps/web/lib/notifications.ts` → `@camp404/db/broadcasts`. Called by the **`/api/notifications/pending`** GET handler; the client reaches it through `fetch()`.
- `acknowledgeDelivery({ deliveryId, userId })` — via `apps/web/lib/notifications.ts` → `@camp404/db/broadcasts`. Called by the **`/api/notifications/acknowledge`** POST handler; the client reaches it through `fetch()`.
- Auth/access on both routes: `getAuthenticatedUser` (`lib/auth`), `ensureCampUser` + `hasCampAccess` (`lib/users`). REUSE; unchanged.
- **No server actions** (`"use server"`) — this organism uses **route handlers**, not actions (it is a non-form, poll-driven client; route handlers give it a pollable GET endpoint).

---

## API & data flow — props/inputs, fetch vs receive, state

- **Props:** **none.** `<AcknowledgementGate />` is self-contained and self-fetching (`component-library.md` "Props: (self-fetches)"; S25 "no props; self-fetches"). It takes no inputs from the layout.
- **What it fetches (does NOT receive):** the entire pending queue, client-side, from `GET /api/notifications/pending` → `{ pending: PendingItem[] }`. Polled every `45_000 ms` + on tab focus/visibility. There is no server-passed initial data (it mounts on public pages too).
- **State held:**
  - `queue: PendingItem[]` — oldest-first (server `orderBy createdAt`); the displayed item is always `queue[0]` (`current`).
  - `acking: boolean` — true while a POST is in flight (drives the Spinner + Button `disabled`).
  - `requestIdRef` (monotonic int) — de-race token; an acknowledge bumps it so a slower in-flight poll can't re-add the just-dismissed item.
  - `scrollRef` — the scroll column; reset to top when a new `current` surfaces.
- **State flow:**
  1. Mount → `load()` → set `queue`. Interval + focus listeners keep it fresh.
  2. `current = queue[0]`; if none → `return null` (renders nothing).
  3. When `current` exists → body scroll locks; the member scrolls to the end.
  4. Acknowledge → `setAcking(true)` → POST `{deliveryId: current.deliveryId}` → ok: bump `requestIdRef`, `setQueue(q => q.filter(i => i.deliveryId !== current.deliveryId))`, `router.refresh()` (so the unread bell badge + inbox RSC reflect the read/ack stamp); non-ok: silent no-op (item stays); `finally setAcking(false)`.
- **Not a form:** no field validation client-side. Server-side validation is the route's `z.string().uuid()` on `deliveryId` (400 on failure) plus owner+presentation scoping inside `acknowledgeDelivery`'s SQL predicate.

---

## States — every state incl. the global matrix + gating

| State | Trigger | Render / behaviour |
|---|---|---|
| **Empty (null)** | `queue.length === 0` — the common case, incl. **every unauthenticated page** (anon → `{pending:[]}`) and signed-in-no-camp-access (`!hasCampAccess` → `{pending:[]}`) | `return null` — renders nothing, no overlay, no spinner. |
| **Loading (initial)** | first `load()` in flight, no data yet | **No spinner / no skeleton** (S25 §Loading: "AckTakeover has no spinner on initial poll — shows nothing until data arrives"). Identical to Empty until data resolves. |
| **Populated — single** | `queue.length === 1` | Full-screen takeover: IconBadge disc + mono eyebrow + title + meta + scroll-to-end body + Acknowledge button. **No** "{n} more" line. |
| **Populated — queued** | `queue.length > 1` | Same, plus the `{queue.length - 1} more after this.` line above the Acknowledge button. Always shows `queue[0]` (oldest-first). |
| **Submitting (acking)** | Acknowledge pressed, POST in flight | Button `disabled`, `<Spinner size="sm" aria-hidden>` + "Acknowledge"; the rest of the takeover stays visible; body still scroll-locked. Escape/outside-click cannot dismiss (no dismiss affordance exists — it's a takeover, not a Dialog). |
| **Success → advance** | POST `{ok:true}` | Item filtered from queue; **next item surfaces** (scroll resets to top, body re-locks) OR queue empties → unlocks background scroll + `router.refresh()`. |
| **Success → dismiss (last item)** | POST `{ok:true}` on the only item | Overlay unmounts (`return null`), background scroll restored to its previous value, `router.refresh()`. |
| **Error (POST non-ok)** | `acknowledge` returns non-ok (401/400/`{ok:false}`/network) | **Silent no-op** — `setAcking(false)`, item stays, member can retry. No error banner (deliberate; a retry on the next press or next poll resolves it). |
| **Error (poll non-ok)** | `load()` non-ok or network throw | Silently ignored; the next interval/focus poll retries. Queue is unchanged. |
| **Disabled** | while `acking` | Acknowledge button disabled (the only interactive control). |

### Global matrix / gating states
- **Auth gating:** self-gates via the route handlers — anon and no-camp-access both yield an empty queue → the overlay never appears for them. The client renders on every route (incl. landing) but is inert when empty.
- **Invite-gated / pre-invite / pending / rejected approval:** `getPendingAcknowledgements` is keyed on the camp `userId`; a user without camp access gets `{pending:[]}` from the route (`!hasCampAccess` short-circuit before any DB query). A mid-onboarding member **can** still receive ack takeovers (subject to camp-access) — they are not suppressed (S25 §Onboarding-incomplete).
- **Preview-but-locked (captain/rank gating):** **N/A.** This is a member-level surface — no captain-only data, no `CaptainLock`, no rank gate. (Explicitly per S25 §Gating; the CaptainLock "VIEW ONLY · no data for your rank" treatment is for captain surfaces only.) This organism never renders `CaptainLock`.
- **E2E-test mode:** the `lib/notifications.ts` facade routes `getPendingAcknowledgements`/`acknowledgeDelivery` to the `testStore` when `isE2ETestMode()` — the component is unaware; behaviour is identical.

---

## Build steps — ordered, with prerequisites + acceptance + tests

This is an EXTEND (presentation) task on a working organism. The service layer and routes are REUSE (service-layer plan 04 step 5). **Drop no functionality:** every step preserves the polling, de-race, scroll-lock, and POST flow exactly.

**Dependency prerequisites (must land first):**
1. **`Spinner` atom** promoted to `packages/ui` (atom-spinner.md, build steps 1–2) and exported from `@camp404/ui`. *Blocks* the Loader2→Spinner swap (step 2 below).
2. **`IconBadge` atom** promoted to `packages/ui` (atom-iconbadge.md) and exported. *Blocks* the header-disc treatment (step 3 below).
3. **`Button` atom** token fixes (atom-button.md steps 1–4: radius/weight/outline) — already a dependency of nearly every surface; not strictly blocking the ack restyle but should land in the same `@camp404/ui` pass.
4. **Status/foundations tokens** (`foundations-tokens.md` / `design-tokens.md`) — needed for the `bg-background` short-form normalisation and the `primary/18%` IconBadge tint. Soft prerequisite.
5. **Routes + service layer:** already exist (`/api/notifications/pending`, `/api/notifications/acknowledge`, `getPendingAcknowledgements`, `acknowledgeDelivery`) — **no change** (service-layer plan 04 confirms "logic unchanged"). The `hasCampAccess` core move (architecture Phase 1) is a route-side change owned by plan 01, not this component.

**Steps:**

1. **Confirm-no-logic-change baseline.** Keep `POLL_INTERVAL_MS=45_000`, the `requestIdRef` de-race, the scroll-lock effect (restoring the **previous** overflow), `current = queue[0]`, `if (!current) return null`, and the `acknowledge()` flow (bump ref → filter → `router.refresh()`; non-ok silent) verbatim.
   - *Acceptance:* a behavioural diff shows no change to fetch URLs, poll cadence, de-race, scroll-lock, or POST handling. Existing E2E for the ack flow passes untouched.

2. **Swap inline `Loader2` → `Spinner` atom** (prereq 1). Replace `{acking && <Loader2 className="h-4 w-4 animate-spin" />}` with `{acking && <Spinner size="sm" variant="inline" aria-hidden />}`; remove the `Loader2` import.
   - *Acceptance:* `grep "Loader2" apps/web/app/acknowledgement-gate.tsx` returns nothing; the spinner honours `motion-safe:animate-spin` (reduced-motion guard from the atom). Button still `disabled` while `acking`.

3. **Header disc via `IconBadge`** (prereq 2). Replace the inline `Megaphone` chip with `<IconBadge icon={Megaphone} size="lg" tint="primary" aria-hidden />` (60 px, `primary/18%`) and keep the mono uppercase eyebrow "CAMP ANNOUNCEMENT" as a sibling `<span>` (`JetBrains Mono / 11px / 700 / $accent`). Keep `aria-labelledby="ack-title"` pointing at the `<h1>` title (the disc is decorative).
   - *Acceptance:* header renders the primary disc + mono eyebrow matching board `31-s22-global-overlays.txt` AckTakeover `ic`; the `Megaphone` import remains only as the icon arg.

4. **Add the scan overlay.** Insert the decorative `#00dcff08` scanline rect (token-driven, `aria-hidden`, `pointer-events-none`) per S25 §1 / board motif. Layer it under the content (`absolute inset-0 -z-10` or sibling behind the scroll column).
   - *Acceptance:* scanline visible, non-interactive, does not intercept scroll or button clicks.

5. **Add the reassurance line.** Below the Acknowledge button render "You can't dismiss this until you acknowledge." [`Inter / 11px / $muted-foreground`].
   - *Acceptance:* line present beneath the button in the populated state; absent when empty (whole overlay is absent).

6. **Token normalisation.** `bg-[color:var(--color-background)]` → `bg-background`; meta line to `text-muted-foreground` (already), eyebrow to `$accent`. Keep the deliberate `max-w-2xl` width exception (S25 §Breakpoints / §Divergences #6 — wider long-read column; documented, not drift). Keep `role="dialog" aria-modal="true"`, `fixed inset-0 z-[100]`.
   - *Acceptance:* no verbose `[color:var(...)]` spellings remain in the file; width stays `max-w-2xl`; a11y attrs intact.

7. **Regression verify** the full takeover end-to-end (see tests).
   - *Acceptance:* all states in the matrix render correctly; no behavioural regression.

### Tests
- **E2E (Playwright, `testStore`-seeded `acknowledge` deliveries):**
  - Publishing an `acknowledge` broadcast surfaces the takeover within ≤45s (and immediately on tab focus).
  - Body scroll is locked while the takeover is up; background restored on dismiss.
  - Acknowledge → item drops → next item surfaces (scroll resets to top) → on last item, overlay disappears and the unread bell badge / inbox reflect the change (`router.refresh()`).
  - `queue.length > 1` shows the "{n} more after this." line; single item does not.
  - Anon / no-camp-access: overlay never appears (route returns `{pending:[]}`).
  - Non-ok acknowledge (simulate route 400/`{ok:false}`): silent no-op, item stays, retry succeeds.
- **Atom unit tests** (in the atom plans, not duplicated here): Spinner `motion-safe:animate-spin` + `aria-hidden`; IconBadge `lg`/`primary` tint.
- **No new service-layer test** — `getPendingAcknowledgements`/`acknowledgeDelivery` are REUSE; presentation-scoped + owner-scoped guards are enforced in SQL (service-layer plan 04 step 5 "no service change").
- **a11y:** `role="dialog" aria-modal="true" aria-labelledby="ack-title"` present; the IconBadge + Spinner are `aria-hidden`; the Acknowledge button has an accessible name; focus is trapped within the overlay while a `current` item exists.

---

## Consumers — which surfaces mount it

- **S25 Global overlays → AckTakeover** (`design/spec/surfaces/25-global-overlays.md`, §1) — the **only** consumer. Mounted **once, app-wide** in `apps/web/app/layout.tsx` (currently `:52`), inside `<Providers>`, after `{children}`, beside `<FeedbackGate>`. It is route-independent: it floats over whatever screen is active (and is inert/`null` on public pages and for users with no pending `acknowledge` deliveries).
- Not mounted by any individual page surface (S06/S09/S15/etc.) — they rely on the single root-layout mount. (S09 Notifications inbox renders the `feed`/`popup` rows; the `acknowledge` presentation is owned exclusively by this gate.)
