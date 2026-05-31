# 26 — Push notifications opt-in & delivery

**Files covered:**
- `apps/web/components/push/enable-push.tsx` — client opt-in UI; detects support/permission, requests permission on a user gesture, registers/refreshes the FCM token, and re-surfaces foreground messages as native `Notification`s.
- `apps/web/lib/firebase-client.ts` — browser-only Firebase web SDK init; exposes `getMessagingIfSupported()` and `VAPID_KEY`; returns null when unconfigured/unsupported.
- `apps/web/lib/push.ts` — server-only facade over the token data layer with the real-vs-test split (`registerPushToken` / `unregisterPushToken`, no-op under E2E).
- `apps/web/lib/firebase-admin.ts` — lazy firebase-admin singleton; provides the injected `sendPush` (`sendEachForMulticast`) implementation.
- `apps/web/app/api/push/tokens/route.ts` — authenticated POST (register) / DELETE (unregister) device-token registry route.
- `apps/web/app/api/cron/notifications/push/route.ts` — cron-authed GET that drains queued push deliveries via `drainQueuedPush(sendPush)`.
- `apps/web/app/firebase-messaging-sw.js/route.ts` — runtime-generated FCM background service worker served at `/firebase-messaging-sw.js`.
- `packages/db/src/push.ts` — Firebase-free Neon data layer: `upsertPushToken`, `deletePushTokenForUser`, `planPushDrain` (pure), `drainQueuedPush` (DB orchestration).
- `packages/db/src/push-status.ts` — pure decision logic: `shouldPruneToken`, `deliveryPushStatus`, `chunk`, `mapSendResponses`, `PushSend`/`TokenSendResult` types.
- `packages/db/src/schema.ts` (lines 89, 144–155, 734–753, 830–863) — `platformEnum`, `notificationChannelEnum`, `pushDeliveryStatusEnum`, `push_tokens` and `notification_deliveries` tables.
- `apps/web/app/page.tsx` (line 98) — sole mount point of `<EnablePush />` on the authenticated home control panel.

**Purpose:** Lets an authenticated, camp-access-granted member opt in to web push notifications and keeps their FCM device token(s) registered, then delivers queued notifications to those tokens. The opt-in surface is web-only, best-effort, and self-effacing: it renders a single "Enable notifications" button only when push is supported and the browser permission is still undecided; otherwise it renders nothing (and silently refreshes the token when permission was already granted). A daily cron drains queued `push`/`both` `notification_deliveries` to FCM via firebase-admin, marks each delivery `sent`/`failed`/`skipped`, and prunes dead tokens. The push transport is deliberately decoupled: `packages/db` never imports Firebase — the send function is injected.

## Features

### EnablePush opt-in UI (enable-push.tsx)
- Client component (`"use client"`, enable-push.tsx:1) mounted once on the authenticated home page (page.tsx:98), after the gating spine (auth → invite → onboarding → approval) has already passed — so it never prompts signed-out, gated, pending, or rejected users (page.tsx:29-63).
- Support + permission detection on mount (enable-push.tsx:48-73): obtains the Messaging instance via `getMessagingIfSupported()`; if missing, or `typeof Notification === "undefined"`, or `!("serviceWorker" in navigator)`, sets state `"unavailable"`. Otherwise reads `Notification.permission` → `"granted"` / `"denied"` / `"default"`.
- Token auto-refresh when already granted (enable-push.tsx:61-63): on mount, if permission is already `"granted"`, calls `registerToken()` fire-and-forget (`.catch(() => {})`) to refresh the FCM token without any UI.
- Token registration `registerToken()` (enable-push.tsx:25-42): gets the Messaging instance and `VAPID_KEY` (returns `false` if either is missing); registers the service worker `"/firebase-messaging-sw.js"`; obtains an FCM token via `getToken(messaging, { vapidKey, serviceWorkerRegistration })` (returns `false` if no token); POSTs `{ token, platform: "web" }` to `/api/push/tokens`; returns `true`.
- Foreground message surfacing (enable-push.tsx:78-98): while `state === "granted"`, registers one `onMessage` listener that validates `payload.notification` against `FcmNotification` zod schema and, if valid AND `Notification.permission === "granted"`, constructs `new Notification(title, { body: body ?? "", icon: "/icon.svg" })`. Listener is registered exactly once and unsubscribed on cleanup so a remount cannot stack duplicate listeners. (Foreground messages do NOT fire the SW's `onBackgroundMessage`, hence this manual path.)
- Conditional render (enable-push.tsx:100-124): returns `null` for every state except `"default"`; in `"default"` renders a centered `Button` (`variant="secondary"`, `size="sm"`, label "Enable notifications") whose click handler requests permission (see User actions).

### Browser Firebase init (firebase-client.ts)
- NO `server-only` directive, but guarded so it never runs during SSR/RSC (firebase-client.ts:9-13).
- `isConfigured()` (firebase-client.ts:25-33): true only if `apiKey && projectId && messagingSenderId && appId && VAPID_KEY` are all set (note: `authDomain` is read into config but NOT required by `isConfigured`).
- `getMessagingIfSupported()` (firebase-client.ts:40-48): returns `null` if `typeof window === "undefined"` or not configured; else `try`s `await isSupported()` (returns null if unsupported) and returns `getMessaging(firebaseApp())`; any throw → returns `null`.
- `firebaseApp()` (firebase-client.ts:35-37): reuses existing app or `initializeApp(config)`.

### Service worker route (firebase-messaging-sw.js/route.ts)
- `runtime = "nodejs"`, `dynamic = "force-dynamic"` (route.ts:1-2).
- GET serves a generated JS body (Content-Type `text/javascript; charset=utf-8`, `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: /`) (route.ts:37-43).
- Body imports FCM compat scripts from `https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js` and `…firebase-messaging-compat.js`, calls `firebase.initializeApp(<SW_CONFIG>)`, and registers `messaging.onBackgroundMessage` → `self.registration.showNotification(n.title || "Camp 404", { body: n.body || "", icon: "/icon.svg", data: payload.data || {} })` (route.ts:21-35).
- `SW_CONFIG` interpolates the PUBLIC `NEXT_PUBLIC_FIREBASE_*` env at runtime, each defaulting to `""` (route.ts:12-18). Generated, not committed, to keep one config source of truth.

### Token registry route (api/push/tokens/route.ts)
- `runtime = "nodejs"` (route.ts:7).
- Shared `gate()` (route.ts:21-40): `getAuthenticatedUser()` → 401 `{ error: "unauthorized" }` if none; `ensureCampUser(user)` then `hasCampAccess(campUser, user.primaryEmail)` → 403 `{ error: "forbidden" }` if no access; else returns `{ ok: true, campUserId }`. (Same auth shape as `/api/notifications/acknowledge`.)
- POST (register) (route.ts:42-51): gate, then `RegisterBody.safeParse(await req.json().catch(() => null))` → 400 `{ error: "invalid" }` on failure; calls `registerPushToken({ userId: campUserId, ...parsed.data })`; returns `{ ok: true }`.
- DELETE (unregister) (route.ts:53-62): gate, then `DeleteBody.safeParse(...)` → 400 on failure; calls `unregisterPushToken(campUserId, parsed.data.token)`; returns `{ ok: true }`. **No in-repo caller** — the comment cites "web sign-out / native revoke" but nothing in the repo invokes DELETE on this endpoint (only the POST is wired in `registerToken`).

### Server-only token facade (lib/push.ts)
- `registerPushToken(input)` (push.ts:17-25): no-op (`return`) when `isE2ETestMode()`; else `dbUpsertPushToken(input)`. Accepts `{ userId, token, platform, topics? }`.
- `unregisterPushToken(userId, token)` (push.ts:28-34): no-op under E2E; else `dbDeletePushTokenForUser(userId, token)`.
- Route handlers import this facade, never `@camp404/db/push` directly (push.ts:11-13).

### firebase-admin send fn (lib/firebase-admin.ts)
- Lazy singleton `getApp()` (firebase-admin.ts:13-39): builds only on first send; throws `"Firebase admin is not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."` if any of `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` is missing; reuses an existing app if `getApps().length > 0`; else `initializeApp` with `cert({ projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") })` (env stores PEM with literal `\n`).
- `sendPush: PushSend` (firebase-admin.ts:47-55): returns `[]` immediately if `tokens.length === 0`; else `getMessaging(getApp()).sendEachForMulticast({ tokens, notification, data })` and maps results through `mapSendResponses(tokens, res.responses)`. Per-token failures do NOT throw; only a whole-request failure (bad credentials, >500 tokens) rejects.

### Drain cron route (api/cron/notifications/push/route.ts)
- `runtime = "nodejs"` (route.ts:6).
- GET: `assertCron(req)` → returns its 401 `NextResponse` ("Unauthorized") if not an authorized cron call; else `drainQueuedPush(sendPush)`; success → `{ ok: true, ...result }`; any throw → 503 `{ ok: false, error: <message | "push drain failed"> }`.
- Scheduled daily at `25 9 * * *` (vercel.json), after `dispatch` (`15 9 * * *`) which materialises deliveries, after `reminders` (`0 9 * * *`).

### DB data layer (packages/db/src/push.ts)
- `upsertPushToken({ userId, token, platform, topics? })` (push.ts:20-44): inserts into `push_tokens`; `onConflictDoUpdate` on the unique `token` index — sets `userId`, `platform`, optionally `topics`, and `lastSeenAt: new Date()`. So a re-register (or a device handed to another user) rebinds cleanly. `topics` only written when provided.
- `deletePushTokenForUser(userId, token)` (push.ts:47-60): deletes where `token = token AND userId = userId` (owner-scoped).
- `planPushDrain(queued, tokensByUser, send)` (push.ts:77-111): pure (no DB). For each delivery: filters out tokens already in `deadTokens` from earlier in the run; if no tokens → `"skipped"`. Builds `data = { deliveryId: d.id }` plus `refType`/`refId` when non-null. Chunks tokens by 500 and calls `send(batch, { title, body }, data)`. Sets status via `deliveryPushStatus(results)`; adds tokens to `deadTokens` when `!success && shouldPruneToken(errorCode)`. Returns `{ statusById, deadTokens }`.
- `drainQueuedPush(send)` (push.ts:129-209): reads `notification_deliveries` where `pushStatus = "queued"` AND `channel IN ('push','both')` (selecting `id, userId, title, body, refType, refId`); returns `{ sent: 0, failed: 0, skipped: 0, pruned: 0 }` if none. Loads `push_tokens` for the distinct recipient userIds, groups into `tokensByUser`, runs `planPushDrain`, then in a pooled transaction conditionally updates each delivery `set { pushStatus, deliveredAt: new Date() (only when sent) }` where `id = id AND pushStatus = "queued"` (idempotency claim — `updated.length === 0` ⇒ already handled, skip count). Deletes pruned tokens (`inArray(token, [...deadTokens])`). Always `await pool.end()` in `finally`. Returns `{ sent, failed, skipped, pruned }`.

### Pure decision logic (packages/db/src/push-status.ts)
- `shouldPruneToken(errorCode)` (push-status.ts:13-15): true iff `errorCode` is truthy AND in `PRUNE_CODES`.
- `deliveryPushStatus(results)` (push-status.ts:35-41): `"skipped"` if empty; `"sent"` if any success; else `"failed"`.
- `chunk(items, size)` (push-status.ts:44-49): throws `"chunk size must be >= 1"` if `size < 1`; else slices into batches of at most `size`.
- `mapSendResponses(tokens, responses)` (push-status.ts:57-66): index-aligns each positional response to `tokens[i]` → `{ token, success, errorCode: r.error?.code ?? null }`. firebase-admin does NOT throw on per-token failure; index alignment is how a failure maps to the exact token to prune.

## User actions & interactions
- **Tap "Enable notifications"** (enable-push.tsx:107-119): the ONLY user-facing action. On click: `await Notification.requestPermission()`. If result `!== "granted"`: set state to `"denied"` when result is `"denied"`, otherwise stay `"default"` (e.g. dismissed). If `"granted"`: `await registerToken()` then set state `"granted"`. Any throw in the handler → state `"unavailable"`.
- **(Automatic) token refresh** — no tap required; happens on mount when permission already granted (enable-push.tsx:61-63).
- **(Automatic) foreground notification display** — incoming foreground FCM messages while granted spawn a native `Notification` (enable-push.tsx:85-92).
- **(Automatic) background notification display** — handled by the service worker `onBackgroundMessage` (firebase-messaging-sw.js/route.ts:28-35), independent of the page being open.
- There is NO disable/opt-out toggle in this surface (no UI calls DELETE); revocation is via the browser's own permission controls. <!-- low-confidence: no in-repo caller of the DELETE /api/push/tokens endpoint; sign-out token cleanup appears unimplemented in this repo -->

## States & presentations
EnablePush local state machine `State = "loading" | "unavailable" | "default" | "granted" | "denied"` (enable-push.tsx:16):
- **loading** — initial; renders `null` (detection in flight).
- **unavailable** — push/Notification/serviceWorker unsupported, unconfigured, `getMessagingIfSupported()` null, or a throw during request; renders `null`.
- **default** — permission undecided; **the only state that renders the button**. This is the surface's only visible "empty/undecided" affordance.
- **granted** — permission granted; renders `null`; registers token + foreground listener.
- **denied** — permission denied; renders `null` (never re-prompts; browser controls only).

Server/route presentations:
- **Unauthorized (token route)** — 401 `{ error: "unauthorized" }` (no session). Corresponds to invite-gated/unauthed states being blocked upstream.
- **Forbidden (token route)** — 403 `{ error: "forbidden" }` when `!hasCampAccess` (invite-gated / not-yet-approved-by-access).
- **Invalid (token route)** — 400 `{ error: "invalid" }` on zod parse failure (validation-error).
- **Success (token route)** — 200 `{ ok: true }`.
- **Unauthorized (cron)** — 401 plain text "Unauthorized" when `CRON_SECRET` missing/mismatch.
- **Drain success** — 200 `{ ok: true, sent, failed, skipped, pruned }`.
- **Drain failure / unconfigured Firebase** — 503 `{ ok: false, error }` (firebase-admin throws when env missing).

Per-delivery push states (`push_delivery_status`): `queued` (default, awaiting drain) → `sent` (≥1 token succeeded; `deliveredAt` stamped) / `failed` (all tokens failed) / `skipped` (recipient has no tokens). `in_app`-channel deliveries are never drained, so they remain `queued` forever (push.ts:120-127, by design).

Global-states applicability:
- **Empty** — `state="default"` (button shown) is the "no decision yet" empty affordance; drain "empty" = no queued rows → zeroed result.
- **Loading** — `state="loading"`.
- **Populated** — `state="granted"` with token registered.
- **Validation-error** — token route 400; client request fails silently (no UI error surfaced; `registerToken` swallows fetch outcome).
- **Submitting/pending** — `push_status="queued"`; client request in flight (no spinner shown).
- **Success** — `state="granted"`; route `{ ok: true }`; delivery `sent`.
- **Disabled** — `state="denied"`/`"unavailable"` render nothing (no disabled control is shown).
- **Invite-gated / Onboarding-incomplete / Pending-approval / Rejected** — never reach the mount because the page gating spine redirects first (page.tsx:29-63); the token route additionally enforces auth + `hasCampAccess`.
- **Captain-only-locked** — N/A; push opt-in is rank-agnostic (every camp member sees it).
- NO offline/sync state and NO budget/over-target state (per product invariants).

## Enums, options & configurable values
- `platformEnum = pgEnum("platform", ["web", "ios", "android"])` (schema.ts:89). Client always sends `"web"` (enable-push.tsx:39); `ios`/`android` are accepted by the route enum but unused by web push.
- Route `RegisterBody.platform = z.enum(["web", "ios", "android"])` (tokens/route.ts:15) — mirrors `platformEnum`.
- `notificationChannelEnum = pgEnum("notification_channel", ["push", "in_app", "both"])` (schema.ts:144-148). Drain selects `channel IN ('push','both')` only.
- `pushDeliveryStatusEnum = pgEnum("push_delivery_status", ["queued", "sent", "failed", "skipped"])` (schema.ts:150-155). Default `"queued"`.
- `PRUNE_CODES` (push-status.ts:6-10) — dead-token FCM error codes that trigger deletion: `"messaging/registration-token-not-registered"`, `"messaging/invalid-registration-token"`, `"messaging/invalid-argument"`. Transient codes (e.g. `messaging/internal-error`, `messaging/server-unavailable`) are NOT pruned (push-status.test.ts:16-21).
- FCM multicast batch cap: **500** tokens per `send` (`chunk(tokens, 500)`, push.ts:102; cap noted push-status.ts:43).
- Notification icon: `"/icon.svg"` (both foreground enable-push.tsx:90 and background SW route.ts:32).
- Default background notification title fallback: `"Camp 404"` (SW route.ts:30).
- FCM compat SDK version pinned: `12.14.0` (SW route.ts:22-23).
- Cron schedule: `/api/cron/notifications/push` at `"25 9 * * *"` (vercel.json) — daily ~09:25 UTC.
- Service worker headers: `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: /` (route.ts:38-42).
- Env (public, client): `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (firebase-client.ts:15-23; `isConfigured` requires all EXCEPT `authDomain`).
- Env (server, secret): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (firebase-admin.ts:17-19); `CRON_SECRET` (cron-auth.ts); `E2E_TEST_MODE` (`"1"` enables test no-op, test-mode.ts).
- `FcmNotification` foreground zod schema: `{ title: string().min(1), body: string().optional() }` (enable-push.tsx:20-23).

## Data model touched
**`push_tokens`** (schema.ts:734-753) — agrees with unit 29:
- `id uuid PK defaultRandom`
- `userId uuid NOT NULL` → `users.id` `ON DELETE cascade`
- `platform platform_enum NOT NULL`
- `token text NOT NULL`
- `topics jsonb $type<string[]> default []` (written only when provided by caller)
- `lastSeenAt timestamp (mode date) NOT NULL defaultNow` (refreshed on upsert conflict)
- `createdAt timestamp (mode date) NOT NULL defaultNow`
- Indexes: `push_tokens_token_idx` UNIQUE on `(token)` (the upsert conflict target); `push_tokens_user_idx` on `(userId)`.

**`notification_deliveries`** (schema.ts:830-863) — fields this unit READS/WRITES (full table owned by units 27/29):
- Reads at drain: `id`, `userId`, `title`, `body`, `refType`, `refId` (push.ts:131-146).
- Filter columns: `pushStatus push_delivery_status NOT NULL default "queued"`; `channel notification_channel NOT NULL`.
- Writes at drain: `pushStatus` ← `sent`/`failed`/`skipped`; `deliveredAt timestamp` ← `new Date()` only when `sent` (push.ts:182-184).
- Other columns on the table (NOT touched here): `broadcastId`, `presentation`, `readAt`, `acknowledgedAt`, `createdAt`.
- FCM `data` payload carries `deliveryId` (always) + `refType`/`refId` (when present) for client deep-linking (push.ts:97-99).

## Validation, edge cases & business rules
- Opt-in button shows ONLY in `state="default"` — never re-prompts after deny; browser is the source of truth for permission (enable-push.tsx:100, 64-65).
- Permission request must run inside the click handler (a user gesture — required by Safari) (enable-push.tsx:9-14, 107-109).
- `registerToken` returns `false` (no error) when Messaging/VAPID/token are unavailable; the fetch result is not inspected — a failed POST is silently best-effort (enable-push.tsx:25-42).
- Foreground notification is only shown if the FCM payload validates AND permission is still `"granted"` at fire time (enable-push.tsx:86-87) — guards against showing notifications after a mid-session revoke.
- `onMessage` listener registered exactly once per `granted` session and unsubscribed on cleanup — prevents duplicate-listener stacking on remount (enable-push.tsx:78-98).
- Token route: requires authenticated session + camp access; both POST and DELETE share the gate; malformed/missing JSON → 400 (route.ts:45,57 use `.catch(() => null)`).
- `token` must be a non-empty string (`z.string().min(1)`); `topics` optional array of strings.
- Upsert rebinds a token to a new owner on conflict (device-handoff safe), refreshing `lastSeenAt` (push.ts:35-43).
- DELETE is owner-scoped: only deletes a `(token, userId)` pair the caller owns (push.ts:54-59) — a user cannot delete another's token.
- Drain idempotency: status update is conditional on row still `queued`; an overlapping run cannot double-write (push.ts:186-193). Comment notes the cron is daily so double-send is not a practical concern.
- Within one drain run, a token classified dead by an earlier delivery is excluded from later deliveries' sends (avoids re-sending to and re-collecting a pruned token); a recipient whose only tokens were pruned earlier yields `"skipped"` for later deliveries (push.ts:88-92; push-drain.test.ts:85-104).
- Delivery status rules: `skipped` (no tokens) / `sent` (≥1 success) / `failed` (all fail) (push-status.ts:35-41; push-status.test.ts:24-41).
- Only prune-class FCM error codes delete the token; transient errors retain it for the next run (push-status.ts:13-15; push.ts:106-108).
- `sendEachForMulticast` returns per-token results positionally and does NOT throw on per-token failure; only whole-request failures (bad credentials, >500 tokens) reject → bubbles to 503 (firebase-admin.ts:42-45, 47-55).
- `chunk` throws if size < 1 (defensive; size is hardcoded 500) (push-status.ts:45).
- E2E test mode: `registerPushToken`/`unregisterPushToken` are no-ops (no DB under Playwright) (push.ts:23,32).
- `packages/db` is intentionally Firebase-free; the FCM `send` fn is injected into `drainQueuedPush` so the Neon package never imports firebase (push.ts:11-14, firebase-admin.ts).
- firebase-admin is lazy/singleton: the app builds and runs with NO Firebase config; a missing-config send throws (→ 503) rather than silently no-op'ing (firebase-admin.ts:8-25).
- `in_app`-only deliveries are never drained and remain `queued` permanently — intentional (push.ts:122-124).
- Service worker route is `force-dynamic` and reads public env at request time; a static-export build has no route handlers, but web push is web-only so that's acceptable (route.ts:1-10).
- Cron auth fails closed: unset/empty `CRON_SECRET` authorizes NO request; constant-time, length-guarded compare (cron-auth.ts:7-22).

## Sub-components / variants
- **EnablePush** is the sole UI component; its only rendered variant is the `state="default"` button (`Button variant="secondary" size="sm"`, label "Enable notifications"). All other states render `null` (no spinner, no error toast, no disabled control).
- **DELETE /api/push/tokens** — implemented and tested-by-contract but **orphaned**: no client/server code in the repo calls it. The documented "web sign-out / native revoke" callers do not exist here. <!-- low-confidence: confirmed via repo-wide grep; only the POST path is wired -->
- **`ios` / `android` platform enum members** — accepted by both `platformEnum` and `RegisterBody`, but unreachable from this web-only surface (the client hardcodes `platform: "web"`). Reserved for a future native client.
- **`topics`** field/param — plumbed end-to-end (`registerPushToken` input → `upsertPushToken`), but the web client never sends `topics`, and the drain does not read `topics`. Currently unused dead-weight in this unit.
- **`refType`/`refId`** propagation — carried into the FCM `data` payload by the drain but consumed by unit 27 (deep-link/inbox), not here.
- Server-only handlers/validators/schemas of this unit: `gate()` + `RegisterBody`/`DeleteBody` (token route); `assertCron`/`isAuthorizedCron` (cron-auth); `planPushDrain` (pure, unit-tested) vs `drainQueuedPush` (DB wrapper); `sendPush` (firebase-admin impl of `PushSend`); `mapSendResponses`/`deliveryPushStatus`/`shouldPruneToken`/`chunk` (pure, unit-tested in push-status.test.ts and push-drain.test.ts).
