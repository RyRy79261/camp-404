# 26-enable-push — app integration plan

- **Route(s):** n/a — mounted on authed home · **MOUNTED/EMBEDDED** (no own route)

## Where it is mounted + which surfaces consume it

`EnablePush` is mounted **once**, unconditionally, after the authenticated control-panel render in **`apps/web/app/page.tsx:98`**:

```tsx
{/* Web push opt-in — only for authenticated members; renders nothing
    unless notifications are supported and undecided. */}
<EnablePush />
```

It is reached only after the full G0→G3 gating spine has passed (auth → invite → onboarding / required-actions → approval). No props cross the boundary; the component is entirely self-managing.

**Consuming surface:** S06 Home (`apps/web/app/page.tsx`), documented in `design/spec/impl/app/06-home.md` §M6. That plan notes `components/push/enable-push.tsx` as **REUSE (unchanged)**. No other surface mounts or references `EnablePush`.

---

## Current state — the existing route/files today, and what the redesign changes

All files are confirmed by reading the live tree. This is a redesign of a working app; the entire push subsystem is **REUSE**.

| File | Current content | Redesign change |
|---|---|---|
| `apps/web/components/push/enable-push.tsx` | 125-line `"use client"` organism. `State = "loading" \| "unavailable" \| "default" \| "granted" \| "denied"`. Two `useEffect`s: (1) detection + token refresh; (2) foreground `onMessage` listener. Renders `null` for every state except `"default"`, which renders a centred `<Button variant="secondary" size="sm">` "Enable notifications". | **REUSE** — one presentation reconciliation only: `rounded-md` → `rounded-[var(--radius)]` and `font-medium` → `font-semibold` inherited automatically from the `Button` atom redesign (`atom-button.md` Steps 1–2). No direct edits to this file if the Button token fix lands first; confirm the centred-`sm` width is consistent with the S06 home plan (OQ below). |
| `apps/web/app/page.tsx` | Server component (`force-dynamic`). Line 21 imports `EnablePush`; line 98 renders `<EnablePush />` after the `ControlPanel` mount, inside the root `<>` fragment. | **MODIFY** (owned by the S06 home plan) — the `ControlPanel`/`homeLayers` block is replaced; the `EnablePush` mount at line 98 is **kept verbatim**. |
| `apps/web/app/api/push/tokens/route.ts` | `POST` + `DELETE` route handler. `gate()` → `getAuthenticatedUser()` (401) → `ensureCampUser` + `hasCampAccess` (403). `RegisterBody` zod (`token`, `platform`, `topics?`); calls `registerPushToken` / `unregisterPushToken` via `lib/push.ts`. `runtime = "nodejs"`. | **REUSE** — no change. |
| `apps/web/lib/push.ts` | `"server-only"` facade. `registerPushToken` + `unregisterPushToken`; E2E no-ops (`isE2ETestMode()`). | **REUSE** — no change. |
| `apps/web/lib/firebase-client.ts` | Browser FCM init. `getMessagingIfSupported()` returns `null` on SSR / unconfigured / unsupported / throw. `VAPID_KEY`. `isConfigured()` requires `apiKey + projectId + messagingSenderId + appId + VAPID_KEY` (note: `authDomain` read into config but NOT required — OQ6). | **REUSE** — no change. |
| `apps/web/app/firebase-messaging-sw.js` | Service worker — `onBackgroundMessage` handler. Independent of page render state. Registered by `registerToken()` inside the component. | **REUSE** — no change. |
| `apps/web/lib/__tests__/push-drain.test.ts` | Pure drain drain logic tests. | **REUSE** — no change. |
| `apps/web/lib/__tests__/push-status.test.ts` | Pure push-status decision tests. | **REUSE** — no change. |
| `apps/web/app/api/cron/notifications/push/route.ts` | Drain cron `GET` handler — `assertCron()` → `drainQueuedPush(sendPush)`. Reads `notification_deliveries`; writes `pushStatus`; prunes dead `push_tokens`. | **REUSE** — no change. |

Nothing to **DELETE**. The `DELETE /api/push/tokens` handler and `unregisterPushToken` are intentionally retained as an orphan (no in-repo client caller) per `26-enable-push.md §Divergences` and service-layer plan 04 §DELETE-none. The drain cron route is retained as-is.

---

## File structure — the target files in apps/web

| File | Disposition | Reason |
|---|---|---|
| `apps/web/components/push/enable-push.tsx` | **REUSE** (no direct edit required) | Button token fix lands via `atom-button.md`; EnablePush inherits automatically. If a direct edit is needed to reconcile button width (centred-sm vs full-width — see OQ), change only the wrapper `<div className="mt-4 flex justify-center">`. |
| `apps/web/app/page.tsx` | **MODIFY** (owned by S06 home plan) | Keep `EnablePush` import (line 21) and mount (line 98) verbatim; all other changes are the S06 ControlPanel→RankGroupCard replacement. |
| `apps/web/app/api/push/tokens/route.ts` | **REUSE** | No change. |
| `apps/web/lib/push.ts` | **REUSE** | No change. |
| `apps/web/lib/firebase-client.ts` | **REUSE** | No change. Revisit only if OQ6 (authDomain in `isConfigured`) is resolved affirmatively. |
| `apps/web/app/firebase-messaging-sw.js` | **REUSE** | No change. |
| `apps/web/app/api/cron/notifications/push/route.ts` | **REUSE** | No change. |
| `apps/web/lib/__tests__/push-drain.test.ts` | **REUSE** | No new service test. |
| `apps/web/lib/__tests__/push-status.test.ts` | **REUSE** | No new service test. |

No new page.tsx server component, no new "use client" island, no new layout file, no new `/api` route, no new error/not-found boundary is created by this surface. EnablePush has no own route; all app-layer scaffolding belongs to its host surface (S06 home).

---

## Components composed — the list and where each renders

| Component | Plan | Rendering tier | Role |
|---|---|---|---|
| `EnablePush` (organism) | `design/spec/impl/components/organism-enablepush.md` — **REUSE** | `"use client"` — entirely client-side | The complete opt-in surface; owns the `State` machine and all browser/FCM interaction. Composes exactly one leaf. |
| `Button` (atom, `variant="secondary" size="sm"`) | `design/spec/impl/components/atom-button.md` — **REUSE** | Client (inside the EnablePush client tree) | The single visible affordance; rendered only when `state === "default"`. |

No other components are composed (`CaptainLock`, `SectionHeader`, `TopChrome`, `Card`, `EmptyState`, `Spinner`, `Divider` — none used, confirmed by the surface brief §Components and by reading the live `enable-push.tsx`).

The RSC boundary: `apps/web/app/page.tsx` is a server component that renders `<EnablePush />` without props. The boundary is clean — no server-side data is passed across it; EnablePush reads everything it needs from browser APIs and env vars on the client.

---

## Services & data — service-layer functions / server actions / helpers it calls

All service calls are **REUSE as-is** (service-layer plan 04 §Redesign delta: "the full push subsystem… is REUSE as-is, no service-layer change").

### What the client component calls directly

| Call | Where defined | Triggered by | Classification |
|---|---|---|---|
| `getMessagingIfSupported()` | `apps/web/lib/firebase-client.ts:40` | Mount detection effect + foreground listener effect | REUSE |
| `VAPID_KEY` (constant read) | `apps/web/lib/firebase-client.ts:23` | `registerToken()` guard | REUSE |
| `navigator.serviceWorker.register("/firebase-messaging-sw.js")` | Browser API, SW lives at `apps/web/app/firebase-messaging-sw.js` | `registerToken()` | REUSE |
| `getToken(messaging, { vapidKey, serviceWorkerRegistration })` | `firebase/messaging` | `registerToken()` | REUSE |
| `fetch("POST /api/push/tokens", { token, platform: "web" })` | Route: `apps/web/app/api/push/tokens/route.ts` | `registerToken()`, fire-and-forget; result **not inspected** | REUSE |
| `Notification.requestPermission()` | Browser API | Click handler — inside user gesture (Safari requirement, non-negotiable) | Browser |
| `onMessage(messaging, handler)` | `firebase/messaging` | Foreground listener effect, `state === "granted"` only | REUSE |

### What the route handler calls (server-side, not the component directly)

| Call | Where defined | REUSE |
|---|---|---|
| `getAuthenticatedUser()` | `apps/web/lib/auth.ts` | Yes |
| `ensureCampUser(user)` + `hasCampAccess(campUser, email)` | `apps/web/lib/users.ts` | Yes |
| `registerPushToken({ userId, token, platform })` | `apps/web/lib/push.ts:17` — `"server-only"` facade over `@camp404/db/push:upsertPushToken` | Yes |
| `unregisterPushToken(userId, token)` | `apps/web/lib/push.ts:28` (orphan — no client caller) | Yes — retained, not wired |

### What is fetched server-side vs passed as props

**Nothing is fetched server-side for this surface.** `EnablePush` receives **no props** from `page.tsx`. The server component simply renders `<EnablePush />`. All data inputs are browser-side: `Notification.permission`, `navigator.serviceWorker`, `getMessagingIfSupported()`, FCM `onMessage` payloads. The FCM token comes from `getToken(...)` on the client.

### DB tables touched (indirect, via the route and drain cron)

| Table | Operation | Who | Notes |
|---|---|---|---|
| `push_tokens` | UPSERT on `(token)` unique index | Route `POST /api/push/tokens` → `registerPushToken` → `upsertPushToken` | Refreshes `lastSeenAt`; rebinds owner if device changed |
| `push_tokens` | DELETE by userId+token | Route `DELETE /api/push/tokens` → `unregisterPushToken` (orphan — no current caller) | Retained per spec |
| `push_tokens` | DELETE by token (prune) | Drain cron `GET /api/cron/notifications/push` | On FCM `registration-token-not-registered` / `invalid-registration-token` / `invalid-argument` |
| `notification_deliveries` | SELECT `pushStatus="queued" AND channel IN ('push','both')` + UPDATE to `sent`/`failed`/`skipped` | Drain cron | Downstream; component only produces token rows |

No `@camp404/core` helpers are called by this surface. The push subsystem's pure cores (`shouldPruneToken`, `deliveryPushStatus`, `chunk`, `mapSendResponses` in `packages/db/src/push-status.ts`; `planPushDrain` in `packages/db/src/push.ts`) are consumed by the drain cron, not by the client component. Per architecture.md §Hybrid, they are eligible to relocate to `@camp404/core` but are classified "relocate-or-leave" — their placement does not affect this component.

---

## Gating — gate level + preview-but-locked treatment

**Gate level: rank-agnostic — no CaptainLock applied.**

The surface brief (`26-enable-push.md §Global-state-matrix`) and the organism plan (`organism-enablepush.md §States`) both confirm explicitly: push opt-in is rank-agnostic; every authenticated camp member sees it identically. The Decision 3 preview-but-locked treatment (`requireClearance`, `CaptainLock`, "VIEW ONLY · no data for your rank") does **not apply**.

`EnablePush` is mounted after the G0→G3 gating spine has already resolved in `page.tsx`. The component therefore only ever runs for:
- authenticated users (`getAuthenticatedUser()` returned a user),
- with a valid camp invite redeemed (`hasCampAccess`),
- who have completed onboarding / required-actions,
- and have been approved (or are god accounts).

Invite-gated / onboarding-incomplete / pending-approval states are **never reached** by this component. No `CaptainLock` wrapper, no `requireClearance` call, no rank check, no `viewerRank` prop.

The `POST /api/push/tokens` route has its own `gate()` (auth 401, access 403) as a defence-in-depth layer. Since the component only mounts post-spine, a 401/403 from the token route indicates a session race; the component silently discards the error and transitions to `"granted"` (best-effort behaviour, see OQ4).

---

## States — full machine + global matrix + gating states

Local `State = "loading" | "unavailable" | "default" | "granted" | "denied"`. Only `"default"` renders DOM; the other four render `null`.

| State | Trigger | Renders | Relevant global-state concept |
|---|---|---|---|
| **loading** | Initial — mount detection in flight | `null` | Loading |
| **unavailable** | Push/Notification/serviceWorker unsupported; `getMessagingIfSupported()` returns null; Firebase unconfigured; any throw during detection or click handler | `null` | Disabled |
| **default** | `Notification.permission === "default"` (no prior decision) | Button "Enable notifications" centred `variant="secondary" size="sm"` | Empty / no-decision affordance |
| **granted** (success/populated) | Permission granted (now or previously, detected at mount) | `null` | Populated / Success; token auto-refresh + foreground listener active |
| **denied** | Permission explicitly denied this session | `null` | Disabled; no re-prompt — browser controls only |

**Submitting state:** there is no spinner, no UI change while `POST /api/push/tokens` is in flight. The token POST is fire-and-forget; the component transitions to `"granted"` immediately on `requestPermission() === "granted"`, regardless of POST outcome. This is intentional best-effort behaviour.

**Error state:** not exposed in UI. Token route `400`/`4xx`/`5xx` responses are silently discarded. The foreground `onMessage` handler validates payloads against `FcmNotification` zod schema and drops invalid payloads silently. No toast, no inline error.

**Gating states:** Invite-gated / onboarding-incomplete / pending-approval are **N/A** — component mounts only after the spine passes. `CaptainLock`/preview-but-locked: **N/A** — rank-agnostic.

**Guards preserved (non-negotiable):**
- `Notification.requestPermission()` is called **inside the click handler** (Safari user-gesture requirement).
- The foreground `onMessage` handler re-checks `Notification.permission === "granted"` at fire time (mid-session revoke guard).
- The `FcmNotification` zod validation (`{ title: string().min(1), body: string().optional() }`) runs on every inbound FCM payload before constructing a `Notification`.
- The `active` flag in the detection effect prevents stale-closure state updates after unmount.
- `onMessage` is registered exactly once per `"granted"` state entry and is cleaned up by the effect destructor — remount cannot stack duplicate listeners.
- `registerToken()` returns `false` (not throw) when messaging/VAPID/token are unavailable; the `fetch` result is not inspected.
- The component never re-reads `Notification.permission` after initial detection; once `"denied"`, stays `"denied"`.

---

## Build steps — ordered, with prerequisites + acceptance criteria + e2e/test notes

This surface is REUSE. The only delta is a presentation reconciliation inherited from the Button atom fix. Prerequisites are minimal.

### Step 1 — Confirm service layer + infra unchanged (no-op verification)

**Prerequisite:** none.

**Action:** verify no edits are required to `lib/push.ts`, `@camp404/db/push`, `firebase-client.ts`, the token route, the drain cron route, or the service worker. Service-layer plan 04 classifies all of these REUSE.

**Acceptance:** existing vitest suites (`push-drain.test.ts`, `push-status.test.ts`) pass untouched. `tsc` / `pnpm build` green.

### Step 2 — Button atom redesign lands (prerequisite for the presentation fix)

**Prerequisite:** must be done by the Button atom build (`atom-button.md` Steps 1–2).

**Action (in `packages/ui/src/components/button.tsx`, not in `enable-push.tsx`):**
- Replace `rounded-md` with `rounded-[var(--radius)]` in the CVA base class + size entries.
- Replace `font-medium` with `font-semibold` in the CVA base class.

Once these land, `enable-push.tsx`'s `<Button variant="secondary" size="sm">` automatically renders with 10px radius and semibold label, matching boards 04 + 05 (canvas alias `Button-Outline`). No edit to `enable-push.tsx` itself is needed for this change.

**Acceptance:** in the `"default"` state the button renders with the redesigned tokens (10px radius, semibold label, `bg-secondary` fill). All four null-render states still produce no DOM.

### Step 3 — Resolve button width with S06 home plan (if needed)

**Prerequisite:** Step 2 (Button atom landed); S06 home plan build in progress.

**Action:** reconcile the centred-`sm` vs full-width discrepancy:
- Live code: `<div className="mt-4 flex justify-center">` → centred, not full-width.
- S06 home plan §M6 note: "full-width `Button-Outline`".
- Surface brief §Components: "centred content area", `Button-Outline` with `pad:[9,16]`.

If the S06 home plan confirms full-width, change the wrapper in `enable-push.tsx` from `mt-4 flex justify-center` to `mt-4 w-full` and add `className="w-full"` to the `Button`. If centred-`sm` is confirmed, no edit needed. Either way this is a one-line change — confirm with S06 build owner before touching.

**Acceptance:** button width matches the agreed S06 home layout; all null states unaffected; no functional regression.

### Step 4 — Preserve guards (regression fence — do not refactor away)

**Prerequisite:** Steps 1–3.

**Action:** During any edit to `enable-push.tsx` (even the one-line width fix), verify the following behaviours are intact, verbatim:
1. `Notification.requestPermission()` is called inside the click handler — not in an effect, not before the gesture.
2. `registerToken()` returns `false` (never throws) when messaging/VAPID/token are unavailable; the `await fetch(...)` result is not inspected.
3. The detection effect has an `active` guard; the foreground effect also has an `active` guard.
4. `onMessage` is subscribed inside the `state === "granted"` effect and its return value (`unsubscribe`) is called in the effect cleanup.
5. The at-fire re-check `Notification.permission !== "granted"` returns early without constructing a `Notification`.
6. `FcmNotification.safeParse(payload.notification)` gate is present in the `onMessage` handler.
7. No `Notification.permission` re-read occurs outside the detection effect.

**Acceptance:** mid-session revoke does not fire a foreground notification; remount does not stack listeners; a dismissed permission prompt (neither granted nor denied) keeps the button visible; a throw in the click handler transitions to `"unavailable"`.

### Step 5 — Component tests (RTL + JSDOM)

**Prerequisite:** Steps 1–4.

**Test file:** `apps/web/components/push/enable-push.test.tsx` (new or extend existing).

Mock strategy: mock `@/lib/firebase-client` (`getMessagingIfSupported` → returns mock Messaging or null; `VAPID_KEY`), mock `firebase/messaging` (`getToken` → returns a token string or empty; `onMessage` → returns an unsubscribe spy), mock `Notification` on `window` (permission state + `requestPermission`), mock `fetch` (for the POST).

| Test case | Assert |
|---|---|
| Mount with `Notification.permission === "default"` | Button "Enable notifications" rendered |
| Mount with `Notification.permission === "granted"` | renders `null`; `registerToken` (fetch POST) called once fire-and-forget |
| Mount with `Notification.permission === "denied"` | renders `null`; no fetch call |
| Mount with `getMessagingIfSupported()` returning null | renders `null` (unavailable) |
| Mount with `typeof Notification === "undefined"` | renders `null` (unavailable) |
| Mount with no `serviceWorker` in `navigator` | renders `null` (unavailable) |
| Click in `"default"` state → `requestPermission()` resolves `"granted"` | calls `registerToken` once; transitions to `"granted"`; renders `null` |
| Click → `requestPermission()` resolves `"denied"` | transitions to `"denied"`; renders `null` |
| Click → `requestPermission()` dismissed (returns neither `"granted"` nor `"denied"`) | stays `"default"`; button still visible |
| Click → `requestPermission()` throws | transitions to `"unavailable"`; renders `null` |
| `state === "granted"`: `onMessage` fires with valid payload + permission still `"granted"` | `new Notification(...)` called |
| `state === "granted"`: `onMessage` fires with valid payload but `Notification.permission !== "granted"` | `new Notification` NOT called (mid-session revoke guard) |
| `state === "granted"`: `onMessage` fires with invalid payload (missing title) | `new Notification` NOT called (zod guard) |
| Unmount while `state === "granted"` | `unsubscribe()` spy called (listener cleanup) |
| Remount to `"granted"` twice | `onMessage` called exactly once (no duplicate listeners) |

**E2E_TEST_MODE seam:** `registerPushToken` in `lib/push.ts` is a no-op when `E2E_TEST_MODE = "1"`. Playwright tests exercise the render branches without DB writes. Assert under E2E mode that `POST /api/push/tokens` is either suppressed or returns `{ ok: true }` with no DB side-effect; the component still transitions to `"granted"` and hides.

**Acceptance:** all component tests pass. No new service test required (service layer is REUSE; `push-drain.test.ts` + `push-status.test.ts` are already green). E2E confirms no DB write under test mode.

---

## Open items — surface-specific decisions (cross-ref surface brief §Open-questions)

These are carried forward from `design/spec/surfaces/26-enable-push.md §Open-questions`:

1. **Button width: centred-`sm` (current live code) vs full-width (S06 §M6 note).** The surface brief draws `Button-Outline` centred; S06 says "full-width". Confirm with the S06 home-surface build owner before any edit to the wrapper `<div>`. The only code affected is the wrapper class in `enable-push.tsx:103`. (Step 3 above.)

2. **`DELETE /api/push/tokens` orphan — sign-out integration.** The unregister endpoint is implemented and test-contracted but has no in-repo caller. If `signOut()` should revoke the FCM token before clearing the session, a caller must be added to the sign-out flow (not part of this surface). Retained as orphan until confirmed. (S26 OQ1.)

3. **No `lastSeenAt`-based stale-token sweep.** The data layer does not prune `push_tokens` by age. Only FCM prune-class error codes trigger deletion. A periodic sweep (if wanted) belongs in the drain cron or a separate maintenance cron — not this surface. (S26 OQ2.)

4. **Silent registration failure UX.** If `POST /api/push/tokens` fails (network error, 4xx, 5xx), the component still transitions to `"granted"` and hides. The user believes push is enabled but no token was stored; future deliveries will be `"skipped"`. A product decision is needed on whether a failure should re-surface the button or show a toast. Implementing a fix requires the new `Toast` infrastructure (service-layer plan 04 Step 6, NEW). (S26 OQ4.)

5. **`authDomain` not in `isConfigured()`.** `firebase-client.ts:17` reads `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` into the Firebase config object, but `isConfigured()` does not require it (five required keys are `apiKey`, `projectId`, `messagingSenderId`, `appId`, `VAPID_KEY`). If `authDomain` is absent, Firebase may initialise without error but FCM token retrieval could behave unexpectedly in some environments. Confirm whether `authDomain` should be added to the `isConfigured()` check. (S26 OQ6.)

6. **`push_tokens.topics` unused.** The `topics` jsonb column is plumbed through `registerPushToken` input → `upsertPushToken` but is never populated by the web client and never read by the drain. If topic-based segmented delivery is not planned, the column and its type annotation are dead weight. Not a blocker for this surface. (S26 OQ5.)
