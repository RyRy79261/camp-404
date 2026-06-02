# Verification — 26 push-subsystem

**Verdict:** accurate  ·  checked 78 claims, verified 75.
The doc is a high-fidelity, digit-exact description of the push subsystem; every load-bearing claim (state machine, gate, drain logic, enums, prune codes, batch cap, cron schedule, schema) confirms against source. The only defects are two cosmetic file-path/line-range imprecisions and one minor "tested-by-contract" attribution — none would mislead a rebuild.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Files covered" lists the unit tests as `push-status.test.ts` / `push-drain.test.ts` and cites them as bare filenames (e.g. `push-status.test.ts:16-21`, `push-drain.test.ts:85-104`), implying they live alongside `packages/db/src/push-status.ts`. | The tests actually live under `apps/web/lib/__tests__/`, not `packages/db`. Cited line ranges are correct, but the implied path is wrong. | apps/web/lib/__tests__/push-status.test.ts; apps/web/lib/__tests__/push-drain.test.ts |
| low | `notification_deliveries` cited as `schema.ts:830–863` (and "Files covered" header repeats `830–863`). | The table runs `830–887`; line 863 is the `createdAt` column / closing brace of the column block, and the index block (lines 864–886) plus the closing `);` (887) are part of the same `pgTable`. The 830–863 range does cover every column the doc names, so this is a scoping nuance, not a wrong field. | packages/db/src/schema.ts:830-887 |
| low | DELETE path is "implemented and tested-by-contract but orphaned." | DELETE has no dedicated test; `push-drain.test.ts` only tests `planPushDrain`, and `push-status.test.ts` tests the pure helpers. "tested-by-contract" overstates DELETE's test coverage (only the shared `gate()` + `unregisterPushToken` no-op facade are exercised indirectly). The orphaned/no-caller claim itself is correct. | apps/web/lib/__tests__/*.test.ts (no DELETE test) |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The doc does not note that `drainQueuedPush` uses TWO db handles — `createHttpDb()` for the queued-delivery + token reads and `createPooledDb()` only for the transactional write — and that `pool.end()` is the reason for the `finally`. The doc says "in a pooled transaction" and "Always `await pool.end()`" but never states the reads run on the http (non-pooled) handle. Minor, since behavior is otherwise correctly described. | packages/db/src/push.ts:130,151,172,207 |

## Spot-confirmed
- `"use client"` at enable-push.tsx:1; mounted once at page.tsx:21 (import) + 98 (`<EnablePush />`); grep confirms no other consumer. (enable-push.tsx:1; page.tsx:21,98)
- Gating spine before mount: auth (page.tsx:32-34), invite (40-42), required-actions/onboarding (47-56), approval (61-63) — exactly the "auth → invite → onboarding → approval" claim. (page.tsx:29-63)
- Detection on mount: `getMessagingIfSupported()`; `!messaging || typeof Notification === "undefined" || !("serviceWorker" in navigator)` → `"unavailable"`; else reads `Notification.permission`. (enable-push.tsx:48-68)
- Auto-refresh when granted: `setState("granted"); registerToken().catch(() => {})`. (enable-push.tsx:61-63)
- `registerToken()`: returns `false` if `!messaging || !VAPID_KEY`; registers `"/firebase-messaging-sw.js"`; `getToken(messaging, { vapidKey, serviceWorkerRegistration })`; returns `false` if no token; POSTs `{ token, platform: "web" }` to `/api/push/tokens`; returns `true`. (enable-push.tsx:25-42)
- Foreground listener gated on `state === "granted"`, registered once, validates `payload.notification` via `FcmNotification`, checks `Notification.permission === "granted"`, builds `new Notification(title, { body: body ?? "", icon: "/icon.svg" })`, unsubscribed on cleanup. (enable-push.tsx:78-98)
- `FcmNotification = z.object({ title: z.string().min(1), body: z.string().optional() })`. (enable-push.tsx:20-23)
- Render: `if (state !== "default") return null` then `Button variant="secondary" size="sm"` label `Enable notifications`. (enable-push.tsx:100-124)
- Click handler: `await Notification.requestPermission()`; non-granted → `setState(permission === "denied" ? "denied" : "default")`; granted → `await registerToken(); setState("granted")`; `catch → setState("unavailable")`. (enable-push.tsx:107-119)
- `State = "loading" | "unavailable" | "default" | "granted" | "denied"`. (enable-push.tsx:16)
- firebase-client: no `server-only`; guard comment 9-13; `isConfigured()` requires `apiKey && projectId && messagingSenderId && appId && VAPID_KEY` (authDomain NOT required). (firebase-client.ts:9-33)
- `getMessagingIfSupported()`: null if `typeof window === "undefined" || !isConfigured()`; `try { if (!(await isSupported())) return null; return getMessaging(firebaseApp()); } catch { return null }`. (firebase-client.ts:40-48)
- `firebaseApp()`: `getApps().length ? getApp() : initializeApp(config)`. (firebase-client.ts:35-37)
- SW route `runtime = "nodejs"`, `dynamic = "force-dynamic"`. (firebase-messaging-sw.js/route.ts:1-2)
- SW response headers: `Content-Type: text/javascript; charset=utf-8`, `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: /`. (route.ts:37-43)
- SW body imports `https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js` + `…firebase-messaging-compat.js`; `onBackgroundMessage` → `self.registration.showNotification(n.title || "Camp 404", { body: n.body || "", icon: "/icon.svg", data: (payload && payload.data) || {} })`. (route.ts:21-35)
- `SW_CONFIG` interpolates `NEXT_PUBLIC_FIREBASE_*` each `?? ""`. (route.ts:12-18)
- Token route `runtime = "nodejs"`. (tokens/route.ts:7)
- `gate()`: `getAuthenticatedUser()` → 401 `{ error: "unauthorized" }`; `ensureCampUser(user)` + `hasCampAccess(campUser, user.primaryEmail)` → 403 `{ error: "forbidden" }`; else `{ ok: true, campUserId }`. (tokens/route.ts:21-40)
- POST: gate, `RegisterBody.safeParse(await req.json().catch(() => null))` → 400 `{ error: "invalid" }`; `registerPushToken({ userId: g.campUserId, ...parsed.data })`; `{ ok: true }`. (tokens/route.ts:42-51)
- DELETE: gate, `DeleteBody.safeParse(...)` → 400; `unregisterPushToken(g.campUserId, parsed.data.token)`; `{ ok: true }`. NO in-repo caller — grep of `api/push/tokens` + `method: "DELETE"` finds only the POST in enable-push.tsx:36. (tokens/route.ts:53-62)
- `RegisterBody.platform = z.enum(["web", "ios", "android"])`; `token z.string().min(1)`; `topics z.array(z.string()).optional()`; `DeleteBody = { token: z.string().min(1) }`. (tokens/route.ts:13-19)
- lib/push facade `"server-only"`; `registerPushToken` no-op under `isE2ETestMode()` else `dbUpsertPushToken`; `unregisterPushToken` no-op under E2E else `dbDeletePushTokenForUser`. Imports from `@camp404/db/push`. (push.ts:1-34)
- firebase-admin: lazy `getApp()` throws exact string `"Firebase admin is not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."` on missing env; reuses `getApps()[0]` else `initializeApp` with `cert({ projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") })`. (firebase-admin.ts:15-39)
- `sendPush`: `if (tokens.length === 0) return []`; `getMessaging(getApp()).sendEachForMulticast({ tokens, notification, data })`; `mapSendResponses(tokens, res.responses)`. (firebase-admin.ts:47-55)
- Cron route `runtime = "nodejs"`; `assertCron(req)` early-return; `drainQueuedPush(sendPush)` → `{ ok: true, ...result }`; catch → 503 `{ ok: false, error: err.message | "push drain failed" }`. (cron/notifications/push/route.ts:6-27)
- Cron schedule `{ "path": "/api/cron/notifications/push", "schedule": "25 9 * * *" }`, after dispatch `15 9 * * *` and reminders `0 9 * * *`. (vercel.json:6-8)
- `upsertPushToken`: insert with `topics` only when provided; `onConflictDoUpdate` target `pushTokens.token`, set `{ userId, platform, …topics, lastSeenAt: new Date() }`. (push.ts:20-44)
- `deletePushTokenForUser`: delete where `token = token AND userId = userId`. (push.ts:47-60)
- `planPushDrain`: filters `deadTokens`; `tokens.length === 0` → `"skipped"`; `data = { deliveryId: d.id }` + `refType`/`refId` when non-null; `chunk(tokens, 500)`; `deliveryPushStatus(results)`; adds `r.token` to deadTokens when `!r.success && shouldPruneToken(r.errorCode)`. (push.ts:77-111)
- `drainQueuedPush`: selects `id, userId, title, body, refType, refId` where `pushStatus = "queued"` AND `channel IN ("push","both")`; early `{ sent:0, failed:0, skipped:0, pruned:0 }`; conditional `update set { pushStatus, …deliveredAt when sent }` where `id = id AND pushStatus = "queued"`; `updated.length === 0` → skip; prunes via `inArray(token, [...deadTokens])`; `finally await pool.end()`. (push.ts:129-209)
- `PRUNE_CODES` = exactly `messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, `messaging/invalid-argument`; transient (`internal-error`, `server-unavailable`) NOT pruned (push-status.test.ts:16-21). (push-status.ts:6-15)
- `deliveryPushStatus`: `"skipped"` if empty, `"sent"` if any success, else `"failed"`. (push-status.ts:35-41)
- `chunk`: throws `"chunk size must be >= 1"` if `size < 1`. (push-status.ts:44-49)
- `mapSendResponses`: `{ token: tokens[i], success: r.success, errorCode: r.error?.code ?? null }`. (push-status.ts:57-66)
- `platformEnum = pgEnum("platform", ["web", "ios", "android"])` at schema.ts:89; `notificationChannelEnum = ["push","in_app","both"]` at 144-148; `pushDeliveryStatusEnum = ["queued","sent","failed","skipped"]` default `queued` at 150-155. (schema.ts:89,144-155)
- `push_tokens`: `id uuid PK defaultRandom`; `userId → users.id ON DELETE cascade NOT NULL`; `platform platform_enum NOT NULL`; `token text NOT NULL`; `topics jsonb $type<string[]>().default([])`; `lastSeenAt`/`createdAt` timestamp mode date NOT NULL defaultNow; unique `push_tokens_token_idx` on token, index `push_tokens_user_idx` on userId. (schema.ts:734-753)
- `notification_deliveries`: `pushStatus push_delivery_status NOT NULL default "queued"`; `channel notification_channel NOT NULL`; `deliveredAt` written only when sent; untouched-here columns include `broadcastId`, `presentation`, `readAt`, `acknowledgedAt`, `createdAt`. (schema.ts:830-862, push.ts:182-184)
- Cron auth fails closed: `if (!secret) return false; if (!authHeader) return false`; length guard before `timingSafeEqual`; `assertCron` returns `new NextResponse("Unauthorized", { status: 401 })`. (cron-auth.ts:12-38)
- `isE2ETestMode()` = `process.env.E2E_TEST_MODE === "1"`. (test-mode.ts:11-13)
- FCM batch cap 500 (`chunk(tokens, 500)`, push.ts:102); test confirms 1100 tokens → 3 send calls (500+500+100). (push.ts:102; push-drain.test.ts:70-83)
- Same-run dead-token exclusion + later-delivery `"skipped"` for a recipient whose only token was pruned (push-drain.test.ts:85-104). (push.ts:88-92)

## Low-confidence / could-not-verify
- The doc's "Same auth shape as `/api/notifications/acknowledge`" — the `gate()` shape (401 unauthorized / 403 forbidden via `getAuthenticatedUser`+`ensureCampUser`+`hasCampAccess`) is confirmed in tokens/route.ts, but I did not open `/api/notifications/acknowledge` to confirm the parity claim. Cross-subsystem, cosmetic.
- "agrees with unit 29" / "consumed by unit 27" — cross-unit attribution not verified against units 27/29 docs; the schema fields themselves are confirmed.
- Safari "user gesture required" rationale (enable-push.tsx:9-14 comment) — a browser-platform claim, not verifiable from source; the code does run `requestPermission()` inside the click handler as described.
- Whether `firebase-admin` env (`FIREBASE_PRIVATE_KEY`) actually stores PEM with literal `\n` in any deployed env — depends on deployment secrets, not in-repo; the `.replace(/\\n/g, "\n")` transform is confirmed in code.
