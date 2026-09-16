# Sub-project D — Push delivery pipeline (design + plan)

**Date:** 2026-05-30
**Status:** Proposed — synthesized from the `d-push-research` workflow (codebase scan + Firebase web-push + firebase-admin + Capacitor research).
**Program:** Camp 404 audit remediation, sub-project **D**. Drains the **push** half that C left at `pushStatus='queued'`. Builds on C (notification_deliveries) + reuses B's `assertCron`.

## Approach — web-first, platform-agnostic server

C fans out `notification_deliveries` with `pushStatus='queued'` but nothing sends a push. D builds the sender. **Decisions (from research):**

1. **Web-first, native deferred.** Build the web client (firebase web SDK + service worker + VAPID) now; defer all native (`@capacitor-firebase/messaging`) client work to Phase 7 (the mobile static-export build is broken/deferred — a native client now would be untestable dead code). But build **every server piece platform-agnostic** so native is later additive client work hitting the same unchanged endpoint. FCM routes by registration token regardless of platform, so the send path never forks; `push_tokens.platform` (web|ios|android) already exists for this.
2. **Add the `firebase` web SDK** (`apps/web`, `^12.14.0`) — client-only, browser-guarded. `firebase-admin ^13.10.0` is already present (this is its first import). **`packages/db` stays Firebase-free** — the send fn is *injected* into the drain helper.
3. **`assertCron` is the current pattern** (5 cron routes use it; the dispatch route's inline-Bearer comment is stale) — the new push cron uses `assertCron` directly.
4. **Everything builds with NO Firebase config**: `firebase-admin` init is lazy and throws only when called (the `groq.ts`/`telegram.ts` convention → 503, never silent); all `firebase/messaging` client code is browser-only behind `await isSupported()`.

## Pipeline
1. **Register:** `enable-push.tsx` (web-only, mounted in `layout.tsx` beside `<AcknowledgementGate/>`) requests permission, registers `/firebase-messaging-sw.js`, `getToken({ vapidKey, serviceWorkerRegistration })`, POSTs the FCM token → `/api/push/tokens` → upsert `push_tokens` on the unique `token` index.
2. **Drain:** cron `/api/cron/notifications/push` (`assertCron`) → `drainQueuedPush(send)` reads `notification_deliveries WHERE pushStatus='queued' AND channel IN ('push','both')`, joins `push_tokens` by user, sends via `firebase-admin sendEachForMulticast` (≤500/batch), flips `pushStatus` → `sent`/`failed`/`skipped` (skipped = user has no tokens), and prunes dead tokens (by FCM error code).

## Components
| File | Responsibility |
|---|---|
| `packages/db/src/push.ts` | **Firebase-free.** `upsertPushToken`, `deletePushTokenForUser`, `listTokensForUsers`, `pruneTokens`, and `drainQueuedPush(send)` (mirrors `dispatchDueBroadcasts`: http read; pooled tx claim + `pool.end()` finally; flip `pushStatus`). `send` injected. |
| `packages/db/package.json` | Add `"./push"` export. |
| `apps/web/lib/firebase-admin.ts` | `server-only`. Lazy `getMessagingClient()` (guards `getApps()`, `cert()` with `privateKey.replace(/\\n/g,"\n")`, throws if any `FIREBASE_*` unset); `sendPush(tokens, notification, data)` wrapping `sendEachForMulticast`, chunk ≤500, classify each response by index → success / prune / transient-fail. |
| `apps/web/lib/push.ts` | `server-only` facade with the `isE2ETestMode()` test/real split (testStore no-op) so routes work under Playwright with no DB. Routes import here, never `@camp404/db/push` directly. |
| `apps/web/app/api/push/tokens/route.ts` | `nodejs`. POST upsert + DELETE unregister. Auth = `getAuthenticatedUser`+`ensureCampUser`+`hasCampAccess` (like the acknowledge route); Zod `{ token, platform: web\|ios\|android, topics? }`; owner-scoped delete. |
| `apps/web/app/api/cron/notifications/push/route.ts` | `nodejs`, GET, `assertCron`, calls `drainQueuedPush` injecting `sendPush`; returns `{ ok, sent, failed, skipped, pruned }`. |
| `apps/web/public/firebase-messaging-sw.js` | NEW (create `public/`). Compat `importScripts` (gstatic app-compat + messaging-compat pinned 12.14.0), inlined public `NEXT_PUBLIC_FIREBASE_*` literals (a static file can't read env), `onBackgroundMessage` → `showNotification`. |
| `apps/web/lib/firebase-client.ts` | Browser-only (NO `server-only`). HMR-safe app singleton; async `getMessagingIfSupported()` awaiting `isSupported()`. |
| `apps/web/components/push/enable-push.tsx` | `"use client"`, web-only, `isSupported`-guarded: register SW + permission + `getToken` + POST; `onMessage` foreground. Graceful "blocked" state. |
| `apps/web/app/layout.tsx` | Mount `<EnablePush/>` once inside `<Providers>`. |
| `apps/web/package.json` | Add `firebase ^12.14.0`. |
| `turbo.json` | Add the 6 `NEXT_PUBLIC_FIREBASE_*` to `globalEnv`. |
| `apps/web/vercel.json` | Add the push cron `25 9 * * *` (after the `15 9` dispatch cron, so deliveries exist to drain). |

## Env (operator-provided)
- **Server (already in `globalEnv`):** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (store `\n`-escaped → unescape at runtime), `CRON_SECRET` (reused).
- **New client (add to `globalEnv`):** `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_VAPID_KEY`. These public values must **also** be hardcoded into the static `firebase-messaging-sw.js`. `.env.example` is permission-blocked → documented for the operator, not edited.

## Task order (TDD)
1. Add `firebase ^12.14.0`; `pnpm install`; baseline `typecheck` green (no imports yet).
2. **TDD `packages/db/src/push.ts`** with a **stubbed `send`** — assert: only `channel IN (push,both)` selected (in_app never), ≥1 success → `sent`, zero tokens → `skipped`, all-fail → `failed`, `messaging/registration-token-not-registered` → prune (transient codes don't), >500 chunked, second run idempotent. Then implement.
3. Add `./push` export + barrel typecheck.
4. **TDD `lib/firebase-admin.ts`** — throws when `FIREBASE_*` unset; `\n`-unescape; per-response→token outcome mapper.
5. `lib/push.ts` facade + test-mode split.
6. **TDD `/api/push/tokens`** — 401 / 400 / 200 upsert / owner-scoped DELETE.
7. `/api/cron/notifications/push` (`assertCron`) — 401 on bad secret; delegates to `drainQueuedPush(stub)`.
8. `public/firebase-messaging-sw.js` + `lib/firebase-client.ts` (no server import).
9. `enable-push.tsx` + mount in `layout.tsx`.
10. `turbo.json` globalEnv + `vercel.json` cron; document env for operator.
11. Full gate: `lint typecheck test build` (build must pass with **no** Firebase config) + e2e test-mode path needs no Firebase/DB.

## Risks (from research)
- Build green with no config → lazy/guarded admin init; never init at module top level.
- `firebase/messaging` is browser-only (crashes in SSR/RSC) → only in `"use client"`, dynamic, behind `isSupported()`.
- `FIREBASE_PRIVATE_KEY` `\n`-escaping is the #1 admin footgun.
- `sendEachForMulticast` resolves a `BatchResponse` (doesn't throw per-token) → must iterate `responses[i]` by index to prune dead tokens.
- **Channel filter is D's job** — C left `pushStatus='queued'` on *all* rows incl. `in_app`; the drain MUST filter `channel IN (push,both)` or in-app notifications get pushed.
- Idempotency → claim each delivery by flipping `pushStatus` off `queued` inside the tx; `pool.end()` in `finally`.
- SW must be at root `/firebase-messaging-sw.js`; `public/` doesn't exist yet.

## Boundaries
- **Native (Phase 7):** `@capacitor-firebase/messaging` client POSTing to the same `/api/push/tokens` — additive client work, no server change. Not built now (mobile build deferred; needs the deployed API base URL + APNs key + a real device).
- Actual FCM delivery is operator-config-gated and verified manually; CI exercises the queue/drain logic with a stub send.
