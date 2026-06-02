# Enable push (opt-in component) — functional brief

- **Route(s):** n/a — not a route; mounted as a client component inside the authenticated home (`apps/web/app/page.tsx`, line 98)
- **Canonical board(s):** `S23 Enable push` (board #32, 430×px, `design/.spec-extract/boards/32-s23-enable-push.txt`)
- **Superseded / dropped:** none — single board, no iterations
- **Breakpoints:** mobile-first 430px (canonical board size); component is full-width within the home layout, centred; no breakpoint-specific layout changes

---

## Purpose

A self-effacing opt-in component mounted once on the authenticated home page, after the gating spine (auth → invite → onboarding → approval) has already resolved. It surfaces a single "Enable notifications" button when — and only when — the browser permission state is undecided (`"default"`). In every other state it renders nothing. Its sole job is to prompt the user once, register an FCM device token on acceptance, and then disappear. All subsequent push delivery (background service worker, foreground message surfacing, daily drain cron) runs automatically without further user interaction.

---

## Layout & modules

The board shows a single vertical container (`w:430 pad:20 jc:center ai:center`) with a centered content area (`gap:28`). The "Invisible states" annotation block in the board is design-time documentation — it does not render at runtime.

### Visible state (permission `"default"` only)

A single horizontally-centred `Button-Outline` instance with label "Enable notifications" (`pad:[9,16]`). No heading, no explanatory copy, no icon, no enclosing card. The button is the entire surface.

### Null states (render nothing)

The board explicitly annotates four null-render states in JetBrains Mono comment style:

- `// loading → renders nothing`
- `// unavailable → renders nothing`
- `// granted → renders nothing`
- `// denied → renders nothing`

These are exhaustive: four of the five local state values produce no DOM output.

---

## Components used

| Component | Role | Key props / variants |
|---|---|---|
| `Button-Outline` (canvas reusable, #05) | Primary (and only) UI affordance | Label override `"Enable notifications"`; `pad:[9,16]`; `variant="secondary"`, `size="sm"` in live code |

No other canvas reusables (`TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `Button-Primary`, `InputField`, `Card`, `EmptyState`, `CaptainLock`) are used.

**New components introduced by this surface:**

- `EnablePush` (client component, `apps/web/components/push/enable-push.tsx`) — the entire opt-in surface; manages local permission state machine; mounts in `page.tsx`.

---

## States

`EnablePush` manages a local state machine: `State = "loading" | "unavailable" | "default" | "granted" | "denied"`.

| State | Trigger | Renders |
|---|---|---|
| **loading** | Initial mount; detection in flight | `null` — nothing |
| **unavailable** | Push/Notification/serviceWorker unsupported; `getMessagingIfSupported()` returns null; unconfigured Firebase; any throw during detection | `null` — nothing |
| **default** | Permission is `Notification.permission === "default"` (undecided) | **The only visible state.** Centred Button-Outline "Enable notifications" |
| **granted** | Permission granted (either just now or on a previous visit detected on mount) | `null` — button hidden; token auto-refresh and foreground listener active |
| **denied** | Permission explicitly denied by the user during this session | `null` — button hidden; no re-prompt mechanism in UI (browser controls only) |

### Global state matrix

| Global state | Applies? | Behaviour |
|---|---|---|
| **Empty** | Yes — `"default"` is the "no decision yet" affordance | Button shown |
| **Loading** | Yes — `"loading"` on mount | Renders nothing |
| **Populated** | Yes — `"granted"` with token registered | Renders nothing |
| **Validation-error** | Partial — token route returns 400 on bad payload | Silently swallowed; no UI error exposed |
| **Submitting / pending** | Background only — token POST in flight; `push_status = "queued"` for deliveries | No spinner; no UI change |
| **Success** | Yes — `"granted"`; route `{ ok: true }`; delivery `sent` | Renders nothing |
| **Disabled** | Yes — `"denied"` / `"unavailable"` | Renders nothing (no disabled control shown) |
| **Invite-gated** | N/A — component is mounted after the gating spine passes | Never reached |
| **Onboarding-incomplete** | N/A — same gate already resolved | Never reached |
| **Pending / Rejected approval** | N/A — same gate | Never reached |
| **Captain-locked (preview-but-locked)** | N/A — push opt-in is rank-agnostic; every camp member sees it | No CaptainLock applied |

---

## User actions

| Action | Result |
|---|---|
| Tap "Enable notifications" (only in `"default"` state) | Calls `Notification.requestPermission()` inside the click handler (required by Safari for user-gesture gating). If result is `"granted"`: calls `registerToken()` then sets state `"granted"`. If result is `"denied"`: sets state `"denied"`. If dismissed (neither granted nor denied): stays `"default"`. Any throw sets state `"unavailable"`. |
| (Automatic) token refresh on mount | When mount detects `Notification.permission === "granted"`, calls `registerToken()` fire-and-forget — no UI change. Refreshes `lastSeenAt` on `push_tokens` via upsert. |
| (Automatic) foreground notification display | While `state === "granted"`, one `onMessage` FCM listener is registered. On a valid inbound payload (`FcmNotification` zod schema), spawns `new Notification(title, { body, icon: "/icon.svg" })`. Unsubscribed on cleanup; cannot stack on remount. |
| (Automatic) background notification display | Service worker `onBackgroundMessage` handles FCM payloads when the page is not in the foreground. Independent of page state; no UI affordance on this surface. |

There is no disable/opt-out toggle on this surface. Revocation is via the browser's own permission controls. The `DELETE /api/push/tokens` endpoint is implemented but has no in-repo UI caller.

---

## Data & enums

### Tables read / written

**`push_tokens`** (schema.ts:734–753) — written by `registerToken()` via `POST /api/push/tokens` → `upsertPushToken`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK defaultRandom` | |
| `userId` | `uuid NOT NULL → users.id ON DELETE cascade` | Bound to authenticated camp user |
| `platform` | `platformEnum NOT NULL` | Always `"web"` from this surface |
| `token` | `text NOT NULL` | FCM registration token |
| `topics` | `jsonb $type<string[]> default []` | Not sent by web client; never written here |
| `lastSeenAt` | `timestamp NOT NULL defaultNow` | Refreshed on every upsert/re-register |
| `createdAt` | `timestamp NOT NULL defaultNow` | |

Unique index `push_tokens_token_idx` on `(token)` is the upsert conflict target; a token can rebind to a new owner (device-handoff safe).

**`notification_deliveries`** (schema.ts:830–863) — read and written by the drain cron, not by the client component directly. Fields this unit touches at drain time:

| Column | Read / Write | Notes |
|---|---|---|
| `pushStatus push_delivery_status` | Read (filter `= "queued"`) + Write (`sent`/`failed`/`skipped`) | Default `"queued"` |
| `channel notification_channel` | Read (filter `IN ('push','both')`) | `in_app`-only rows never drained |
| `deliveredAt` | Write (`new Date()` only when `sent`) | |
| `id`, `userId`, `title`, `body`, `refType`, `refId` | Read at drain | |

### Enums

| Enum | Values | Usage |
|---|---|---|
| `platformEnum` (`schema.ts:89`) | `web \| ios \| android` | Client always sends `"web"`; `ios`/`android` reserved for future native clients |
| `notificationChannelEnum` (`schema.ts:144`) | `push \| in_app \| both` | Drain selects `channel IN ('push','both')` |
| `pushDeliveryStatusEnum` (`schema.ts:150`) | `queued \| sent \| failed \| skipped` | Default `"queued"`; drain updates to terminal state |

### New schema

None. All tables and enums are pre-existing. No additions required for this surface.

---

## Validation & edge cases

- **Permission prompt timing:** `Notification.requestPermission()` must execute inside the click handler. Calling it outside a user gesture silently fails on Safari. This is non-negotiable.
- **Silent best-effort registration:** `registerToken()` returns `false` (not an error) when Messaging/VAPID/token are unavailable. The `POST /api/push/tokens` fetch result is not inspected — failures are silently discarded. No error toast is shown.
- **No re-prompt after deny:** once the browser has recorded `"denied"`, the component renders nothing and provides no UI path back. The user must use browser settings. The component never re-reads `Notification.permission` after initial detection.
- **Foreground notification guard:** the `onMessage` handler validates the payload against `FcmNotification` zod schema (`{ title: string().min(1), body: string().optional() }`) AND checks `Notification.permission === "granted"` at fire time — guards against showing notifications after a mid-session permission revoke.
- **Listener deduplication:** `onMessage` is registered exactly once per `"granted"` state entry and is cleaned up via the `useEffect` destructor. Remounting cannot stack duplicate listeners.
- **Upsert owner rebind:** if the same FCM token previously belonged to another user (device hand-off), the upsert rebinds it to the current user and refreshes `lastSeenAt`. Owner-scoped; only the owning `(token, userId)` pair can be deleted.
- **Token route gating:** `POST /api/push/tokens` runs a `gate()` check — `getAuthenticatedUser()` → 401; `hasCampAccess` → 403. Since the component mounts only after the home gating spine has passed, a 401/403 here indicates a session race or invalid state. The client does not surface these errors.
- **Drain idempotency:** delivery `pushStatus` update is conditional on the row still being `"queued"`. An overlapping cron run cannot double-write. Within one drain run, a token pruned by an earlier delivery is excluded from later deliveries' send batches.
- **Token pruning:** FCM error codes `messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, `messaging/invalid-argument` trigger deletion from `push_tokens`. Transient errors (`messaging/internal-error`, `messaging/server-unavailable`) do not prune — the token is retried next cron run.
- **FCM multicast batch cap:** tokens chunked at 500 per `sendEachForMulticast` call. Per-token failures do not throw; only a whole-request failure (bad credentials, >500 tokens) rejects → 503 from the cron route.
- **`in_app`-only deliveries never drained:** deliveries with `channel = 'in_app'` are not selected by the drain and remain `"queued"` permanently — intentional design, not a bug.
- **E2E test mode:** `registerPushToken` and `unregisterPushToken` are no-ops when `E2E_TEST_MODE = "1"`. No DB writes occur under Playwright.
- **Firebase-free DB layer:** `packages/db` never imports Firebase. The `sendPush` function is injected into `drainQueuedPush` at call time. This keeps the Neon package portable and testable without FCM credentials.
- **Missing Firebase config at drain time:** `firebase-admin` is lazy; if `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` are unset, `getApp()` throws on the first send attempt → 503 from the cron route. Prefer an explicit config-missing error over silent no-op.
- **Service worker `Cache-Control`:** `public, max-age=0, must-revalidate` with `Service-Worker-Allowed: /` ensures the SW is always re-fetched and allowed to intercept the full origin.

---

## Flows

```
[Authenticated home mounts]
  → <EnablePush /> mounts (client component)
      → getMessagingIfSupported() + Notification.permission check
          → unsupported / unconfigured / throw → state "unavailable" → renders null
          → "granted"  → state "granted"  → registerToken() (fire-and-forget) → renders null
                         → foreground onMessage listener registered
          → "denied"   → state "denied"   → renders null
          → "default"  → state "default"  → renders Button-Outline "Enable notifications"

[User taps "Enable notifications"]
  → Notification.requestPermission() (user-gesture required)
      → "granted"  → registerToken()
                       → POST /api/push/tokens { token, platform: "web" }
                           → 200 { ok: true } → state "granted" → renders null
                           → 4xx (silently discarded) → state "granted" → renders null
      → "denied"   → state "denied"   → renders null
      → dismissed  → state "default"  → button still visible

[Daily cron 09:25 UTC]
  → GET /api/cron/notifications/push
      → assertCron() → drainQueuedPush(sendPush)
          → reads notification_deliveries (pushStatus="queued", channel IN push|both)
          → loads push_tokens for recipient userIds
          → chunks tokens (≤500), calls sendEachForMulticast per batch
          → updates pushStatus → sent / failed / skipped; stamps deliveredAt when sent
          → prunes dead tokens from push_tokens
          → returns { sent, failed, skipped, pruned }
```

---

## Divergences from feature-set reference

| Feature-set signal | Board | Resolution |
|---|---|---|
| Reference says `Button variant="secondary"` (`size="sm"`) | Board outline shows `Button-Outline` (the canvas reusable #05) | Board wins. `Button-Outline` is the shared design-system variant that maps to `variant="secondary"` in the live `Button` primitive. No functional conflict; naming is the design-canvas alias. |
| Reference documents the entire push subsystem — firebase-client, firebase-admin, service worker, token route, drain cron, DB layer | Board shows only the client opt-in component | This brief scopes to the visible component and its direct data interactions. Server infrastructure (firebase-admin, drain cron, push-status logic) is described here only as far as it defines states and data the opt-in component produces. Full server infrastructure belongs in a separate backend spec. |
| Reference documents `DELETE /api/push/tokens` for sign-out / native revoke | Board shows no opt-out/disable UI | Board wins: no opt-out control is drawn. The DELETE endpoint is implemented and retained in the server layer, but is an orphan — no in-repo client caller. Flagged in open questions. |
| Reference calls the foreground `Notification` display an automatic background action | Board has no annotation for foreground notification display | Reference is correct; the board simply does not annotate automatic behaviours. Both are included in this brief. |
| Reference notes `topics` field is plumbed end-to-end but the web client never sends it | Board makes no mention of `topics` | Reference is accurate. `topics` is dead-weight on this surface; retained in the schema description as an existing column; not a spec concern for this surface. |
| Reference mentions `ios`/`android` members of `platformEnum` | Board and component only ever send `"web"` | Reference accurately describes the enum. `ios`/`android` are reserved for future native clients; not a divergence, just a note. |

No features implied by the board have been dropped. No locked decision (decisions.md) conflicts with this surface — push opt-in is rank-agnostic and requires no CaptainLock.

---

## Open questions / build reconciliations

1. **DELETE /api/push/tokens orphan:** the unregister endpoint is implemented and test-contracted but has no client caller. The anticipated "web sign-out / native revoke" integration is missing. Should `signOut()` (when implemented) call DELETE to clean up the device token before clearing the session? Confirm with build owner; until then the token persists until `lastSeenAt`-based pruning (if any) or a prune-class FCM error.

2. **No `lastSeenAt`-based pruning:** the data layer does not implement any age-based sweep of stale `push_tokens`. A user who never grants permission (or whose token goes stale without a prune-class FCM error) accumulates a dead token row indefinitely. Confirm whether a periodic stale-token sweep is wanted, or whether FCM prune codes are considered sufficient.

3. **No opt-out UI:** once granted, a user cannot revoke their push token from within the app — they must use browser settings. This is a deliberate design choice per the board, but may cause confusion. Confirm whether a "Disable notifications" toggle should be added to the Profile or Settings surface.

4. **Silent registration failure UX:** if `POST /api/push/tokens` fails (network error, 4xx, 5xx), the component transitions to `"granted"` state regardless and hides the button. The user believes push is enabled but no token was stored. If Firebase sends a notification, the delivery will be `"skipped"` (no tokens). Consider whether a failure should re-surface the button or show a toast.

5. **`topics` field unused:** `push_tokens.topics` is plumbed through `registerPushToken` input → `upsertPushToken` but is never populated by the web client and never read by the drain. Confirm whether topic-based segmented delivery is planned; if not, the column and type are dead weight.

6. **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` required at client but not by `isConfigured`:** `authDomain` is read into the Firebase config object but is NOT one of the five keys `isConfigured()` requires. If `authDomain` is absent, Firebase may still initialise without error but FCM token retrieval could behave unexpectedly in some environments. Verify whether `authDomain` should be added to `isConfigured`.

7. **`prefers-reduced-motion`:** not applicable to this surface (no animation), but the home page hosting this component may carry CRT/glitch effects. No issue here specifically; raised for completeness.
