# EnablePush — organism plan

- **mapsTo / home:** **REUSE** (keep as-is) · lives in **`apps/web`** (keep-app-local — it is `"use client"`, owns a browser-permission state machine, and talks directly to the FCM browser SDK + `/api/push/tokens`; it can never move to `@camp404/ui` which may never import `next/*` / browser-SDK env or define routes) · **Target file:** `apps/web/components/push/enable-push.tsx` (unchanged path).
- **Tier:** organism (composite client component). Composes exactly one leaf: the `Button` atom.
- **One-line role:** a self-effacing web-push opt-in. Renders a single button **only** when `Notification.permission === "default"`; in every other state (`loading | unavailable | granted | denied`) it renders `null`. On grant it registers an FCM token and disappears; all subsequent delivery is automatic.

Per the component-library entry: *"keep `apps/web/components/push/enable-push.tsx`. Renders a single Button-Outline only in `default` permission state; null otherwise."* Per service-layer plan 04 §Redesign delta: the full push subsystem (this component, `lib/push`, `firebase-client`, the token route, the drain cron) is **REUSE as-is, no service-layer change**. The only redesign work here is a small presentation reconciliation (Button variant/width) — see Build steps.

---

## Current state — what exists today (the old design's component/markup), cite files

The component **already exists and is correct**. This is a redesign of a working app; EnablePush is REUSE, not NEW.

- **`apps/web/components/push/enable-push.tsx`** (the whole organism, 125 lines):
  - `"use client"`; `type State = "loading" | "unavailable" | "default" | "granted" | "denied"`, initial `"loading"` (`:16`, `:45`).
  - `FcmNotification` zod schema (`:20-23`) — `{ title: string().min(1), body: string().optional() }`, used to validate inbound foreground payloads before constructing a `Notification`.
  - `registerToken()` (`:25-42`) — `getMessagingIfSupported()` + `VAPID_KEY` guard → `navigator.serviceWorker.register("/firebase-messaging-sw.js")` → `getToken(...)` → `fetch("/api/push/tokens", { method: "POST", body: { token, platform: "web" } })`. Returns `false` (not throw) when messaging/VAPID/token are unavailable; **the fetch result is not inspected** (best-effort, failures silently discarded).
  - **Detection effect** (`:48-73`) — runs once on mount with an `active` guard; sets `unavailable` when messaging is null / `Notification` undefined / no `serviceWorker`; else maps `Notification.permission` → `granted` (and fires `registerToken().catch(()=>{})`) / `denied` / `default`.
  - **Foreground listener effect** (`:78-98`) — only while `state === "granted"`; registers exactly one `onMessage` listener, re-validates the payload via `FcmNotification` AND re-checks `Notification.permission === "granted"` at fire time, then `new Notification(title, { body, icon: "/icon.svg" })`. Cleaned up via the effect destructor (`unsubscribe?.()`), so remounts can't stack listeners.
  - **Render** (`:100-124`) — `if (state !== "default") return null;` then a centred wrapper `<div className="mt-4 flex justify-center">` containing `<Button variant="secondary" size="sm" onClick={…}>Enable notifications</Button>`. The click handler calls `Notification.requestPermission()` (inside the gesture — Safari requirement), then on `"granted"` → `registerToken()` + `setState("granted")`; on `"denied"`/dismissed → set `denied`/stay `default`; any throw → `unavailable`.
- **`apps/web/lib/firebase-client.ts`** — browser FCM init; exports `getMessagingIfSupported()` (`:40`, returns null on SSR / unconfigured / unsupported / throw), `VAPID_KEY` (`:23`), private `isConfigured()` (`:25`, requires apiKey + projectId + messagingSenderId + appId + VAPID_KEY; **note** `authDomain` is read into the config object at `:17` but is NOT one of the five required keys — S26 OQ6). No `server-only`; guarded by `typeof window` + `isSupported()`.
- **`apps/web/app/firebase-messaging-sw.js`** — the service worker (`onBackgroundMessage`), registered by `registerToken()`. Independent of this component's render state.
- **Mount:** `apps/web/app/page.tsx:21` imports `EnablePush`; `:98` renders `<EnablePush />` once, after the authenticated control panel, beneath the gating spine (auth → invite → onboarding → approval has already resolved). Confirmed in surface brief S26 §Route and S06 §M6.

There is **no other markup to redesign** — grep of `apps/web` shows the only references are the import + mount in `page.tsx`; there is no duplicate or legacy push opt-in elsewhere. Nothing to DELETE.

---

## Composition — leaf components, core helpers, services/server-actions; server vs client split

- **Split:** **`"use client"` (entirely)**. There is no server-component shell — EnablePush self-manages a browser state machine and reads `Notification.permission`/`navigator.serviceWorker`, which only exist client-side. It is mounted directly inside the (server) home page; no props cross the boundary.

- **Leaf components it consumes:**
  - **`Button`** atom — `design/spec/impl/components/atom-button.md` (REUSE, `packages/ui/src/components/button.tsx`). The single visible affordance. Used as `variant="secondary" size="sm"` today; the Button plan lists EnablePush at row "`components/push/enable-push.tsx` · `secondary size="sm"`" and documents `variant="secondary"` as the EnablePush-driven variant. No other leaf (no Card, SectionHeader, IconBadge, Spinner, CaptainLock) is used — S26 §Components confirms "No other canvas reusables are used."

- **`@camp404/core` helpers:** **none.** EnablePush has no pure business logic to extract — its logic is browser-permission orchestration + FCM I/O, which is inherently Next/browser-coupled and stays app-side per the layering rule (architecture.md §Dependency layering: only `apps/*` touch browser-SDK env / routes). The `push-status.ts` pure cores (`shouldPruneToken`, `deliveryPushStatus`, `chunk`, `mapSendResponses`) and `planPushDrain` belong to the **drain cron**, not this component (architecture.md §Hybrid: "carry as-is… eligible to relocate to core but stay in db unless the cross-domain call is to move all pure cores"). This component never imports them.

- **Services / server-actions / routes it calls** (named from service-layer plan 04):
  - **`POST /api/push/tokens`** (`apps/web/app/api/push/tokens/route.ts`) — the only network call, via `fetch` in `registerToken()`. Body `{ token, platform: "web" }`. Route runs `gate()` → `getAuthenticatedUser()` (401) → `ensureCampUser` + `hasCampAccess` (403); validates `RegisterBody` zod (`{ token, platform: enum, topics? }`, 400 on miss); calls `registerPushToken({ userId, ...data })`; returns `{ ok: true }`. **REUSE.**
  - **`registerPushToken`** (`apps/web/lib/push.ts:17`) — `"server-only"` facade over `@camp404/db/push`'s `upsertPushToken`; **no-op under `E2E_TEST_MODE`** (no DB writes under Playwright). **REUSE.**
  - **`upsertPushToken`** (`@camp404/db/push:20`) — upsert on the unique `(token)` index → `push_tokens` (owner-rebind safe; refreshes `lastSeenAt`). **REUSE.**
  - **Not called by this component (named for completeness, owned downstream):** `unregisterPushToken` / `DELETE /api/push/tokens` — implemented, test-contracted, **orphan** (no in-repo caller); explicitly RETAINED per S26 §Divergences + plan 04 §DELETE-none (OQ1: should `signOut()` call it). `drainQueuedPush(sendPush)` / `sendPush` (`lib/firebase-admin`) — the daily cron (`/api/cron/notifications/push`, 09:25 UTC) that actually delivers; EnablePush only produces the token rows it reads. `countUnread` (header bell) — sibling consumer on the same home page, unrelated to opt-in.

---

## API & data flow — props/inputs, fetch vs receive, state flow; forms: actions + validation

- **Props:** **none.** The component is self-contained (`export function EnablePush()`); the component-library entry states "(self-manages permission state machine)." No data is passed from the server page.
- **Inputs (read, not props):** `Notification.permission` (browser), `navigator.serviceWorker` (browser), `getMessagingIfSupported()` + `VAPID_KEY` (from `firebase-client`, reading `NEXT_PUBLIC_FIREBASE_*` env), inbound FCM `onMessage` payloads.
- **Fetches vs receives:** receives nothing from the server tree; **fetches** only `POST /api/push/tokens` (fire-and-forget, result ignored). The FCM token itself comes from `getToken(messaging, { vapidKey, serviceWorkerRegistration })`.
- **State flow:** a single `useState<State>` machine, initial `"loading"`. Transitions:
  - mount detection → `unavailable | granted | denied | default`;
  - in `default`, click → `requestPermission()` → `granted | denied | default(dismissed) | unavailable(throw)`;
  - on entering `granted`, the second effect attaches the `onMessage` listener; leaving `granted` (or unmount) detaches it.
- **Form treatment:** **not a form.** No `<form>`, no server action, no field validation. The only "submit" is the imperative `Notification.requestPermission()` inside the click handler (must be inside the user gesture — Safari requirement, non-negotiable per S26 §Validation). The only zod validation in-component is `FcmNotification` on **inbound** foreground payloads (defence against malformed external push data), not on user input. Route-side validation (`RegisterBody`) is owned by the route, not the component.

---

## States — full machine + global matrix + gating

Local machine `State = "loading" | "unavailable" | "default" | "granted" | "denied"`. Only `default` renders DOM; the other four render `null`.

| State | Trigger | Renders | Side-effect |
|---|---|---|---|
| **loading** | initial mount; detection in flight | `null` | none |
| **unavailable** | push/Notification/serviceWorker unsupported, `getMessagingIfSupported()` null, unconfigured Firebase, or any throw during detection or during the click handler | `null` | none |
| **default** (empty / no decision) | `Notification.permission === "default"` | **only visible state** — centred `Button` "Enable notifications" | on click → `requestPermission()` |
| **granted** (success / populated) | permission granted (now or on a prior visit detected at mount) | `null` | mount: fire-and-forget `registerToken()`; while granted: one `onMessage` foreground listener active |
| **denied** (disabled) | permission explicitly denied this session | `null` | none; **no re-prompt** — browser controls only; never re-reads `Notification.permission` after initial detection |

**Global state matrix (mapped):**

| Global state | Applies? | Behaviour |
|---|---|---|
| **Empty** | Yes | `"default"` is the "no decision yet" affordance → button shown |
| **Loading** | Yes | `"loading"` on mount → renders nothing (no skeleton; architecture.md §Loading: "internal `loading` state → renders nothing") |
| **Populated / Success** | Yes | `"granted"` with token registered / route `{ ok:true }` / delivery `sent` → renders nothing |
| **Validation-error** | Partial | token route 400 on bad payload → **silently swallowed**, no UI error; component still transitions to `granted` and hides (S26 OQ4 flags the UX gap) |
| **Submitting / pending** | Background only | token POST in flight; deliveries `push_status="queued"` → **no spinner, no UI change** |
| **Disabled** | Yes | `"denied"` / `"unavailable"` → renders nothing (no disabled control shown) |
| **Invite-gated / Onboarding-incomplete / Pending-or-Rejected approval** | **N/A** | component mounts only **after** the gating spine passes — never reached |
| **Captain-locked (preview-but-locked)** | **N/A** | push opt-in is **rank-agnostic** — every camp member sees it identically; **no CaptainLock applied**. This is NOT a captain/rank surface, so the D3 preview-but-locked treatment (`requireClearance`, "VIEW ONLY · no data for your rank") does not apply here. (S26 §Global-matrix and architecture.md §EnablePush both confirm.) |

---

## Build steps — ordered, with prerequisites + acceptance + tests

This is REUSE; the only redesign delta is one presentation reconciliation. Prerequisites are minimal because the service layer is untouched.

1. **Confirm service layer + infra unchanged (no-op verification).**
   - *Prereq:* none.
   - *Action:* verify no edits to `lib/push.ts`, `@camp404/db/push`, `firebase-client.ts`, the token route, or the SW. Plan 04 classifies all of these REUSE.
   - *Acceptance:* `tsc`/build green; existing vitest suites (`push-drain.test.ts`, `push-status.test.ts`) pass untouched.

2. **Reconcile the Button presentation (the one divergence).**
   - *Prereq:* the **Button** atom plan (`atom-button.md`) lands first — its redesign normalises radius (`rounded-[var(--radius)]`), weight (`font-semibold`), and the variant classes. EnablePush inherits these automatically through `@camp404/ui`.
   - *Divergence to resolve:* three sources name the affordance differently — S06 §M6 says **full-width** `Button-Outline`; S26 board + component-library say `Button-Outline` (= `variant="secondary"` per the canvas alias); live code is `variant="secondary" size="sm"` in a centred `mt-4 flex justify-center` wrapper. The component-library is the **canonical contract** and resolves it: "Renders a single Button-Outline" → keep `variant="secondary"`. The S06 "full-width" note is a layout preference of the home surface; reconcile width with the home-surface owner (centred-`sm` per live code, or full-width per S06 M6). Do **not** drop the centred-vs-full-width decision silently — flag it in the home (S06) plan. No functional change either way.
   - *Acceptance:* in `"default"` state the button renders with the redesigned Button tokens (10px radius, semibold label) and the width agreed with S06; all four null states still render nothing.

3. **Preserve every guard (regression fence — do not refactor away).**
   - *Prereq:* steps 1–2.
   - *Action:* keep, verbatim in behaviour: `requestPermission()` inside the click handler; `registerToken()` returns `false` (no throw) on missing messaging/VAPID/token; the fetch result is uninspected; `onMessage` registered once per `granted` entry + cleaned up on the effect destructor; the at-fire `Notification.permission === "granted"` re-check; the `FcmNotification` payload validation; the `active` guard in the detection effect; no re-prompt after `denied`.
   - *Acceptance:* mid-session revoke does not fire a foreground notification; remount does not stack listeners; a dismissed prompt keeps the button visible.

4. **Tests.**
   - *Prereq:* steps 1–3.
   - *Component (RTL, JSDOM, mock `firebase-client` + `Notification`):*
     - mount with `permission==="default"` → button visible; all of `granted`/`denied`/`unavailable`/`loading` → renders `null`.
     - click in `default`: `requestPermission` → `"granted"` calls `registerToken` then hides; `"denied"` hides; dismissed keeps button; throw → `unavailable`.
     - granted mount → fire-and-forget `registerToken` called once; foreground `onMessage` rejects an invalid payload and rejects when permission was revoked at fire time; listener unsubscribed on unmount.
   - *Service (already covered, REUSE):* `push-drain.test.ts`, `push-status.test.ts` — no new service test needed (plan 04 §Build "no service-layer test" for the push subsystem).
   - *E2E:* `registerPushToken` is a no-op under `E2E_TEST_MODE`, so Playwright exercises the render branches without DB writes; assert the button shows in `default` and the POST is suppressed in test mode.
   - *Acceptance:* all component tests pass; no new service test required; E2E confirms no DB write under test mode.

**Functionality preserved (dropped: none):** the visible opt-in button, the five-state machine, silent best-effort registration, automatic token refresh on mount-while-granted, foreground notification surfacing, mid-session-revoke guard, listener dedup, owner-rebind upsert, and the no-re-prompt-after-deny behaviour all remain. The orphan `DELETE` path stays retained (not wired) per S26 §Divergences.

---

## Consumers — which surfaces mount it

- **S06 Home** (`design/spec/surfaces/06-home.md` §M6 "EnablePush row") — the **only** consumer. Mounted **once**, post-gate, in `apps/web/app/page.tsx:98` (`<EnablePush />`), beneath the rank-group control panel and the `Divider`. Service-layer plan 04 §Consumers lists it under "Home control panel → `<EnablePush>` client mount". S26 (`surfaces/26-enable-push.md`) is the component's own functional brief — it is not a route; it has no standalone surface mount.
