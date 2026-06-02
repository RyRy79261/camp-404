# Broadcasts, notifications inbox & push — service-layer plan

Scope: the broadcasts compose/fan-out engine, the recipient-side notifications
inbox + acknowledge gate, and the web-push opt-in/token/drain subsystem. This is
a **redesign on a working app**: nearly everything in this domain already exists
and is correct. The delta is almost entirely **presentation** (S15 composer
restyle, S09 inbox row variants + relative time, S25 ack-takeover styling, S26
push opt-in is unchanged) plus **one genuinely NEW reusable** — the Toast
infrastructure. **No schema change** in this domain (the only redesign schema
change is `captain_promotion_requests`, which belongs to the roster/make-captain
flow, not here — see `_analysis/db-impact.json`).

---

## Consumers — which surfaces/organisms depend on this domain

| Surface (spec) | Route / mount | What it consumes |
|---|---|---|
| **S15 Announcements composer** (`surfaces/15-announcements.md`) | `/captains/announcements` (`page.tsx` + `announcements-manager.tsx` + `actions.ts`) | `listAnnouncements`, `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement` (via `lib/notifications`); `ComposeAnnouncementInput` (`@camp404/types`) |
| **S09 Notifications inbox** (`surfaces/09-notifications.md`) | `/notifications` (`page.tsx`) | `listInbox`, `markRead` (via `lib/notifications`) |
| **S25 Global overlays → AckTakeover** (`surfaces/25-global-overlays.md`) | `acknowledgement-gate.tsx` (mounted in `layout.tsx`); `/api/notifications/pending` + `/api/notifications/acknowledge` | `getPendingAcknowledgements`, `acknowledgeDelivery` (via `lib/notifications`) |
| **S25 Global overlays → Toast** | NEW; mounted app-wide | NEW toast infra (no current backing) |
| **Home control panel** (`page.tsx`) | `/` | `countUnread` (bell badge); `<EnablePush>` client mount |
| **S26 Enable push** (`surfaces/26-enable-push.md`) | `components/push/enable-push.tsx`; `/api/push/tokens` | `registerPushToken`, `unregisterPushToken` (via `lib/push`) |
| **Header bell** (`HomeHeader`, any page rendering it) | — | the unread count produced by `countUnread` |
| **Delivery/reminder/push CRONs** | `/api/cron/notifications/{dispatch,push,reminders}` | `dispatchDueBroadcasts`, `drainQueuedPush` (`@camp404/db` directly); `sendPush` (`lib/firebase-admin`) |
| **Telegram dispatch cron** (cross-domain) | `/api/cron/telegram/dispatch` | `@camp404/telegram` `dispatchPendingAnnouncements` — a parallel mirror of the same `broadcasts` rows to Telegram (see Cross-domain) |

---

## Current state — modules + key exports today

### packages/db (schema + per-domain data access)

- **`packages/db/src/schema.ts`** — tables/enums (no change in this domain):
  - `broadcasts` (`schema.ts:763-807`): `id`, `senderId` (FK→users `set null`), `kind`, `scope`, `team`, `title`, `body`, `channel` (default `both`), `presentation` (default `feed`), `refType`, `refId`, `publishedAt`, `dispatchedAt`, `sendAt`, `createdAt`. Indexes `broadcasts_sender_idx`, `broadcasts_created_at_idx`.
  - `broadcastTargets` (`schema.ts:810-823`): `(broadcastId, userId)` PK — explicit recipients for `scope='individual'`.
  - `notificationDeliveries` (`schema.ts:830-887`): `id`, `broadcastId` (FK `cascade`), `userId`, `title`, `body`, `channel`, `presentation`, `pushStatus` (default `queued`), `refType`, `refId`, `readAt`, `acknowledgedAt`, `deliveredAt`, `createdAt`. Indexes `..._user_read_idx`, `..._user_ack_idx`, `..._broadcast_idx`, partial unique `..._broadcast_user_uniq` on `(broadcastId,userId) WHERE broadcastId IS NOT NULL`.
  - `pushTokens` (`schema.ts:734-753`): `id`, `userId` (FK `cascade`), `platform`, `token`, `topics` (jsonb), `lastSeenAt`, `createdAt`. Unique `push_tokens_token_idx` on `(token)`, `push_tokens_user_idx`.
  - Enums: `broadcastKindEnum` (`128-134`), `broadcastScopeEnum` (`136-142`), `notificationChannelEnum` (`144-148`), `pushDeliveryStatusEnum` (`150-155`), `broadcastPresentationEnum` (`166-170`), `platformEnum` (`schema.ts:89`).

- **`packages/db/src/broadcasts.ts`** — announcements + inbox data access (HTTP/pooled Neon drivers). Exports:
  - `resolveAudience(broadcast, senderId)` (`:52`) → `Promise<string[]>` — fetches members/memberships/drivers/targets, delegates to `computeAudience`.
  - `listAnnouncements()` (`:117`) → `Promise<AnnouncementSummary[]>` — captain management list with `recipientCount`/`acknowledgedCount` correlated subqueries.
  - `createAnnouncementDraft(input)` (`:159`) → `{id}`.
  - `updateAnnouncementDraft(input)` (`:181`) → `boolean` (owned-draft predicate).
  - `deleteAnnouncementDraft(input)` (`:202`) → `boolean`.
  - `publishAnnouncement(input)` (`:228`) → `PublishResult` — transactional claim + inline fan-out, `ON CONFLICT DO NOTHING`.
  - `dispatchDueBroadcasts(now?)` (`:306`) → `DispatchResult` — scheduled fan-out worker (deferred/scoped tail).
  - `getPendingAcknowledgements(userId)` (`:403`) → `PendingAcknowledgement[]` — the ack-gate queue.
  - `acknowledgeDelivery(input)` (`:437`) → `boolean` — owner+presentation-scoped stamp of `acknowledgedAt`+`readAt`.
  - `listInbox(userId)` (`:472`) → `InboxItem[]`.
  - `countUnread(userId)` (`:496`) → `number`.
  - `markRead(userId, ids)` (`:516`) → `void` — snapshot-scoped, `readAt IS NULL` guarded.
  - Types/interfaces: `AnnouncementPresentation`, `AnnouncementSummary` (`:96-110`), `DraftInput`, `PublishResult` (`:214-216`), `DispatchResult`, `PendingAcknowledgement` (`:390-396`), `InboxItem` (`:460-469`).

- **`packages/db/src/audience.ts`** — **PURE, no DB**. `computeAudience(broadcast, data, senderId)` (`:29`) → `string[]`; types `BroadcastScope` (`:6`), `AudienceData` (`:13`). Already framework-agnostic and unit-tested (`apps/web/lib/__tests__/audience.test.ts`).

- **`packages/db/src/push.ts`** — push-token registry + drain orchestration (Firebase-free; send fn injected). Exports:
  - `upsertPushToken(input)` (`:20`) → `void` — upsert on unique `token`.
  - `deletePushTokenForUser(userId, token)` (`:47`) → `void`.
  - `planPushDrain(queued, tokensByUser, send)` (`:77`) → `{statusById, deadTokens}` — **PURE-ish** decision core (DB-free; takes data + injected send); unit-tested.
  - `drainQueuedPush(send)` (`:129`) → `PushDrainResult` — reads queued deliveries + tokens, calls `planPushDrain`, writes terminal status + prunes dead tokens.
  - Types: `QueuedPushDelivery` (`:62`), `PushDrainResult` (`:113`).

- **`packages/db/src/push-status.ts`** — **PURE, no DB, no Firebase**. `shouldPruneToken` (`:13`), `deliveryPushStatus` (`:35`), `chunk` (`:44`), `mapSendResponses` (`:57`); types `TokenSendResult` (`:17`), `PushSend` (`:24`). Unit-tested.

### packages/types (shared Zod/TS)

- **`packages/types/src/announcement.ts`** — `AnnouncementPresentation` zod enum (`:8`); `ComposeAnnouncementInput` (`:23`) with messages "Give it a title."/"Write the announcement.", `presentation.default("acknowledge")`. Re-exported via `src/index.ts`.

### apps/web/lib (Next-coupled orchestration)

- **`apps/web/lib/notifications.ts`** — `"server-only"` facade over `@camp404/db/broadcasts` with a **real-vs-test backend split** (`isE2ETestMode()` → `testStore`). Re-exports the 11 functions (`countUnread`, `listInbox`, `markRead`, `getPendingAcknowledgements`, `acknowledgeDelivery`, `listAnnouncements`, `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement`) and types. App code imports here, never `@camp404/db/broadcasts` directly.
- **`apps/web/lib/push.ts`** — `"server-only"` facade over `@camp404/db/push`: `registerPushToken` (`:17`), `unregisterPushToken` (`:28`); E2E no-ops.
- **`apps/web/lib/firebase-admin.ts`** — `"server-only"` lazy firebase-admin singleton; exports `sendPush: PushSend` (`:47`) backed by `sendEachForMulticast`, mapped via `mapSendResponses`. Throws (→503) when unconfigured.
- **`apps/web/lib/cron-auth.ts`** — `isAuthorizedCron` (`:12`), `assertCron` (`:31`) — constant-time `CRON_SECRET` bearer check.

### apps/web/app (Next routes / actions / client components)

- **`app/captains/announcements/actions.ts`** — `"use server"`; `requireCaptain()` gate (`:23`); `saveDraftAction`/`updateDraftAction`/`deleteDraftAction`/`publishAction` (validate `ComposeAnnouncementInput`, call `lib/notifications`, `revalidatePath`).
- **`app/captains/announcements/page.tsx`** + **`announcements-manager.tsx`** — server page + client manager (the S15 composer UI).
- **`app/notifications/page.tsx`** — RSC inbox; `listInbox` snapshot → `markRead` → render. Currently `presentationIcon` inline, `toLocaleDateString()`, `max-w-2xl`.
- **`app/acknowledgement-gate.tsx`** — `"use client"` ack takeover; `POLL_INTERVAL_MS = 45_000` (`:26`), monotonic `requestIdRef` de-race, body scroll lock, fetches `/api/notifications/pending` + POSTs `/api/notifications/acknowledge`. Mounted in `layout.tsx:52`.
- **`components/push/enable-push.tsx`** — `"use client"` opt-in state machine; `registerToken()` (`:25`) → `getToken` → `POST /api/push/tokens`; `onMessage` foreground display; mounted `page.tsx:98`.
- **`lib/firebase-client.ts`** — browser FCM init; `getMessagingIfSupported`, `VAPID_KEY`, `isConfigured`.
- **Route handlers**: `/api/notifications/acknowledge` (POST, UUID-validated, owner-scoped), `/api/notifications/pending` (GET, anon→`{pending:[]}`), `/api/push/tokens` (POST/DELETE, `gate()` 401/403), `/api/cron/notifications/dispatch` (GET→`dispatchDueBroadcasts`), `/api/cron/notifications/push` (GET→`drainQueuedPush(sendPush)`, 503 on Firebase miss), `/api/cron/notifications/reminders` (GET — **stub**, returns `{ok:true,sent:0}`).
- **Tests** (`apps/web/lib/__tests__/`): `audience.test.ts`, `push-drain.test.ts`, `push-status.test.ts`, `cron-auth.test.ts`. **No** inbox/announcements/publish test exists yet (those paths run live Neon; `lib/test-store.ts` mirrors them for E2E).

---

## Redesign delta — NEW / EXTEND vs REUSE (most is REUSE)

**REUSE as-is (no service-layer change):**
- The entire `broadcasts.ts` data-access surface — `listAnnouncements`, the four draft mutators, `publishAnnouncement`, `dispatchDueBroadcasts`, `getPendingAcknowledgements`, `acknowledgeDelivery`, `listInbox`, `countUnread`, `markRead`, `resolveAudience`. S15/S09/S25 read exactly these. The spec confirms no schema or query shape change (S15 §Data, S09 §Data, S25 §Data all say "NEW schema: none").
- `audience.ts` / `computeAudience` — pure, tested; the everyone-scope path is what S15 exercises.
- The full push subsystem: `push.ts`, `push-status.ts`, `lib/push.ts`, `lib/firebase-admin.ts`, `firebase-client.ts`, `enable-push.tsx`, the token route, the drain cron. S26 §Divergences explicitly says the opt-in component and infra are unchanged ("Board wins: no opt-out control drawn; DELETE endpoint retained as orphan").
- `ComposeAnnouncementInput` / `AnnouncementPresentation` types.
- `lib/notifications.ts` / `lib/push.ts` facades + the real-vs-test split.
- All four cron route handlers' wiring (the `reminders` route stays a stub — see below).
- The captain gate (`requireCaptain`), the inbox auth gate, the ack/pending/token route auth.

**EXTEND (presentation-only, in the consuming surfaces — not the service layer):**
- **S09 inbox**: relative-time formatting (board "2d ago" vs code `toLocaleDateString()`), extract `NotificationRow` + `presentationIcon`, reconcile `max-w-2xl`→standard column, richer empty state. The `InboxItem` shape is sufficient as-is. (Component-layer, not service-layer — flagged for the components plan.)
- **S15 composer**: restyle to mobile-first column, `PresentationSelect`/`PresentationPill` extraction, **Decision 3 preview-but-locked** gating (replaces the current hard redirect; member sees structure, no data, inert controls), **Decision 5 `DictatePill`** on the body. All presentation/gating in the surface; the service functions are unchanged. Note: preview-but-locked needs the page to **not call `listAnnouncements`** for a non-captain (return empty) — an app-layer load-gating concern, no new function.
- **S25 ack-takeover**: keep `max-w-2xl` (deliberate), restyle (header chip, scan overlay, reassurance line). Logic unchanged.

**NEW:**
- **Toast infrastructure** — S25 §5 and §Open-questions: *"NEW component — no toast/sonner primitive exists in `@camp404/ui` yet."* This is the only new build in the domain. It is **purely client/presentation** (transient strip: status icon + message + optional Undo action; auto-dismiss). It carries **no data-access, no DB, no service function**. The "Undo" action cancels/reverses an underlying mutation owned by whatever surface raised the toast — Toast itself is mutation-agnostic. **Belongs in the components plan, not this service-layer plan**; noted here because it is the headline NEW item adjacent to this domain.
- **`popup` presentation surface** — the third `broadcast_presentation` value has **no recipient-side renderer today** (only `acknowledge` → gate, `feed`/`popup` → inbox row). S25 §Open-questions flags ownership: is `popup` rendered as a transient toast or a distinct in-app pop-up? **No service function is needed either way** — `popup` deliveries already land in `notification_deliveries` via the same fan-out and already appear in `listInbox`. Resolving `popup`'s live rendering is a presentation decision (likely reuse the new Toast). Flag for the components plan / product.

---

## Schema & types — additions and migration

**Schema change in this domain: NONE.** Confirmed against `_analysis/db-impact.json` (the sole redesign schema change is `captain_promotion_requests` + `promotion_request_status`, owned by the roster/make-captain flow) and against all four surface briefs (each states "NEW schema: none"). No Drizzle migration is generated by this domain.

**`packages/types` additions: NONE required by the service layer.** `ComposeAnnouncementInput` already covers the composer. Two **optional, presentation-driven** types may be added when the components are built (these are UI contracts, not service contracts):
- A `PresentationMeta` map (`presentation → {icon, label, hint, shortWord}`) for the S15 `PresentationSelect`/`PresentationPill` and the S09 row icon — could live in `packages/types` (shared shape) or stay surface-local. Recommend surface-local (it carries lucide JSX/icon names, which are presentation concerns) unless both surfaces want one source of truth, in which case a string-keyed metadata map (no JSX) in `packages/types/src/announcement.ts`.
- A `ToastStatus = "success" | "info" | "warning" | "error"` union — belongs with the new Toast component / the new status design tokens (`design-tokens.md`), not the service layer.

No Drizzle migration steps. The `notification_deliveries.presentation` column already stores all three variants; the `pushStatus`/`channel` enums already cover the drain. Nothing to alter, add, or backfill.

---

## Target API — function/module surface after this work

All service-layer functions stay where they are. Locations: `packages/db` (schema+data-access), `packages/types` (shared zod/TS), `packages/core` (NEW — pure, framework-agnostic; see Hybrid extraction), `apps/web/lib` (Next-coupled).

### packages/db/src/broadcasts.ts — data access (HTTP/pooled Neon)
| Function | Signature | Class |
|---|---|---|
| `listAnnouncements` | `() → Promise<AnnouncementSummary[]>` | REUSE |
| `createAnnouncementDraft` | `(DraftInput) → Promise<{id}>` | REUSE |
| `updateAnnouncementDraft` | `({id,senderId,title,body,presentation}) → Promise<boolean>` | REUSE |
| `deleteAnnouncementDraft` | `({id,senderId}) → Promise<boolean>` | REUSE |
| `publishAnnouncement` | `({id,senderId}) → Promise<PublishResult>` | REUSE |
| `dispatchDueBroadcasts` | `(now?: Date) → Promise<DispatchResult>` | REUSE |
| `resolveAudience` | `(broadcast, senderId) → Promise<string[]>` | REUSE |
| `getPendingAcknowledgements` | `(userId) → Promise<PendingAcknowledgement[]>` | REUSE |
| `acknowledgeDelivery` | `({deliveryId,userId}) → Promise<boolean>` | REUSE |
| `listInbox` | `(userId) → Promise<InboxItem[]>` | REUSE |
| `countUnread` | `(userId) → Promise<number>` | REUSE |
| `markRead` | `(userId, ids[]) → Promise<void>` | REUSE |

### packages/db/src/push.ts — token registry + drain orchestration
| Function | Signature | Class |
|---|---|---|
| `upsertPushToken` | `({userId,token,platform,topics?}) → Promise<void>` | REUSE |
| `deletePushTokenForUser` | `(userId, token) → Promise<void>` | REUSE |
| `drainQueuedPush` | `(send: PushSend) → Promise<PushDrainResult>` | REUSE |
| `planPushDrain` | `(queued, tokensByUser, send) → Promise<{statusById, deadTokens}>` | REUSE (pure-ish; **could move to packages/core** — see Hybrid) |

### packages/db/src/audience.ts — pure audience math
| Function | Signature | Class |
|---|---|---|
| `computeAudience` | `(broadcast, data: AudienceData, senderId) → string[]` | REUSE (pure; **candidate to move to packages/core** — see Hybrid) |

### packages/db/src/push-status.ts — pure push decision logic
| Function | Signature | Class |
|---|---|---|
| `shouldPruneToken` | `(code?) → boolean` | REUSE (pure; **candidate for packages/core**) |
| `deliveryPushStatus` | `(results[]) → "sent"\|"failed"\|"skipped"` | REUSE (pure) |
| `chunk` | `<T>(items[], size) → T[][]` | REUSE (pure) |
| `mapSendResponses` | `(tokens[], responses[]) → TokenSendResult[]` | REUSE (pure) |

### packages/types/src/announcement.ts
| Symbol | Class |
|---|---|
| `AnnouncementPresentation`, `ComposeAnnouncementInput` | REUSE |
| `PresentationMeta` (string-keyed, no JSX) | NEW (optional, only if shared across S09+S15) |

### apps/web/lib — Next-coupled facades & infra
| Symbol | Where / why Next-coupled | Class |
|---|---|---|
| `lib/notifications.ts` (all 11 re-exports + real/test split) | `"server-only"`, imports `test-store` | REUSE |
| `lib/push.ts` (`registerPushToken`, `unregisterPushToken`) | `"server-only"`, E2E gate | REUSE |
| `lib/firebase-admin.ts` (`sendPush`) | `"server-only"`, firebase-admin, env | REUSE |
| `lib/cron-auth.ts` (`assertCron`, `isAuthorizedCron`) | `next/server` NextResponse | REUSE |

### apps/web/app — routes / actions / clients
| Symbol | Class |
|---|---|
| `captains/announcements/actions.ts` (`requireCaptain`, 4 actions) | REUSE (gating logic EXTEND for Decision 3 if any) |
| `app/notifications/page.tsx` | EXTEND (presentation: relative time, row extract, width) |
| `app/acknowledgement-gate.tsx` | EXTEND (presentation restyle; `45_000` poll unchanged) |
| `components/push/enable-push.tsx` | REUSE |
| `api/notifications/{acknowledge,pending}/route.ts`, `api/push/tokens/route.ts` | REUSE |
| `api/cron/notifications/{dispatch,push}/route.ts` | REUSE |
| `api/cron/notifications/reminders/route.ts` | REUSE (stub; activation = separate **backend spec**, see below) |
| **Toast** component + provider | NEW (components plan) |
| `popup` recipient renderer | NEW (components plan; likely reuses Toast) |

**DELETE: none.** The `DELETE /api/push/tokens` handler and `unregisterPushToken` are orphaned (no in-repo caller) but are **explicitly retained** by S26 §Divergences ("DELETE endpoint implemented and retained"). The `reminders` cron is a live stub, not dead — keep. `broadcastTargets`/scoped-scope paths in `resolveAudience` are unused by the everyone-only S15 composer but are live infrastructure for scoped sends (other compose UIs) and the dispatch cron — keep.

---

## Hybrid extraction — what moves to packages, what stays in app

Per the locked HYBRID decision: keep `packages/db` for schema+data-access; extract **framework-agnostic pure logic** to packages; leave **Next-coupled** bits in `apps/web`.

**Already correctly placed — pure logic that is already framework-agnostic in packages/db (Firebase-free, DB-free):**
- `audience.ts:computeAudience` + `AudienceData`/`BroadcastScope` — pure, no DB, already unit-tested without a database.
- `push-status.ts` (`shouldPruneToken`, `deliveryPushStatus`, `chunk`, `mapSendResponses`, `PushSend`, `TokenSendResult`) — pure, no DB, no Firebase; the send fn is injected.
- `push.ts:planPushDrain` — the drain *decision* core (takes data + injected send; no DB read/write of its own).

These three already embody the hybrid principle (the package author deliberately split pure cores out and injected I/O). **Recommended action: leave them in `packages/db`** unless a `packages/core` is created for the whole redesign — in which case the *purest* ones (`computeAudience`, `push-status.ts`, `planPushDrain`) are the natural candidates to relocate to `packages/core` since they import neither Drizzle nor `./index`/`./schema`. They are zero-dependency. **Decision recommendation:** only move them if `packages/core` is being created for other domains too; a single-domain move adds an import-path churn (`@camp404/db/audience` → `@camp404/core/audience`) for marginal gain. Either placement satisfies the rule. Document the choice once, apply consistently across domains.

**Must STAY in app (Next-coupled / server-only / auth / route handlers) — do NOT move:**
- `lib/notifications.ts`, `lib/push.ts` — `"server-only"`, depend on `isE2ETestMode()` + `testStore` (app test infra).
- `lib/firebase-admin.ts` — `"server-only"`, imports `firebase-admin`, reads `process.env`; this is the I/O impl injected as `PushSend`.
- `lib/firebase-client.ts` — browser SDK, reads `NEXT_PUBLIC_*`.
- `lib/cron-auth.ts` — imports `next/server`.
- `captains/announcements/actions.ts` (`"use server"`, `revalidatePath`, auth/session via `getAuthenticatedUser`/`ensureCampUser`).
- All `app/api/**/route.ts` handlers (`NextResponse`, `runtime`, request parsing, auth gates).
- `acknowledgement-gate.tsx`, `enable-push.tsx` (`"use client"`).

**Stays in packages/db (data-access, correctly so):** everything in `broadcasts.ts` and the DB-touching bodies of `push.ts` (`upsertPushToken`, `deletePushTokenForUser`, `drainQueuedPush`). These are SQL — they belong with the schema.

**Net:** this domain needs **no extraction work** to satisfy the hybrid rule — the prior author already separated pure cores from I/O and from Next. The only open architectural choice is whether the three already-pure modules relocate to a new `packages/core`; that is a cross-domain consistency call, not a correctness requirement here.

---

## Build steps — ordered, with acceptance + tests

This domain is mostly REUSE; the "build" is presentation + one new reusable, with the service layer left intact. Ordered:

1. **Confirm service layer unchanged (no-op verification).** Diff intent: no edits to `broadcasts.ts`, `audience.ts`, `push.ts`, `push-status.ts`, the types, or the facades.
   - *Acceptance:* existing tests (`audience.test.ts`, `push-drain.test.ts`, `push-status.test.ts`, `cron-auth.test.ts`) pass untouched. `tsc`/build green.
   - *Test approach:* run the existing vitest suite; it already covers the pure cores.

2. **(Optional, cross-domain) `packages/core` relocation.** Only if the redesign creates `packages/core`: move `computeAudience`, `push-status.ts`, `planPushDrain` there; update import paths in `push.ts`/`broadcasts.ts` and the tests' import specifiers.
   - *Acceptance:* tests pass after import-path update; no behavior change; `@camp404/db` no longer the home of pure logic.
   - *Test approach:* the three existing pure tests move with the code (or re-point their imports); diff is import-only.

3. **S09 inbox presentation (EXTEND `app/notifications/page.tsx`).** Extract `NotificationRow` + `presentationIcon`; swap `toLocaleDateString()` for a relative-time formatter (per S09 OQ1, e.g. `date-fns/formatDistanceToNow`); reconcile `max-w-2xl`→standard column; richer empty state (bell-off circle). `listInbox`/`markRead` untouched.
   - *Acceptance:* unread rows render the "New" pill + accent; read rows plain; ack-status suffix logic preserved (S09 §States table); badge clears on return to home; null-`senderName` suppresses attribution.
   - *Test approach:* component-layer (Playwright E2E via `testStore`-seeded deliveries); no new service test. Add a unit test for the relative-time + ack-suffix pure helper if extracted.

4. **S15 composer presentation + Decision 3 gating (EXTEND).** Extract `PresentationSelect`/`PresentationPill`/`DraftCard`/`PublishedCard`; mobile-first column; **preview-but-locked** for non-captains (render structure, **do not call `listAnnouncements`** — pass empty, inert controls, `CaptainLock`); wire `DictatePill` (Decision 5) to S21 `RecorderPanel`. Server actions + `requireCaptain` stay the write authority.
   - *Acceptance:* a member navigates in and sees structure + `CaptainLock` "VIEW ONLY · no data for your rank", zero rows, disabled controls; a captain has full read/write; double-publish is idempotent (existing claim logic).
   - *Test approach:* E2E for the gating matrix; the four actions already exercised via `testStore`. Consider a thin unit test of the page's load-gate (member→empty) if extracted to a helper.

5. **S25 ack-takeover restyle (EXTEND `acknowledgement-gate.tsx`).** Header chip, scan overlay, "{n} more after this." (exists), reassurance line; keep `max-w-2xl`, the `45_000` poll, the monotonic de-race, scroll lock, and the POST flow exactly.
   - *Acceptance:* poll surfaces a freshly-published `acknowledge` delivery within ≤45s (and on focus); scroll-to-end → Acknowledge → drop → next → `router.refresh()`; non-ok POST no-ops.
   - *Test approach:* E2E; the route handlers are already auth-tested by shape. No service change.

6. **NEW: Toast infrastructure (components plan — flagged here).** Add a toast provider + `Toast` component to `@camp404/ui` (sonner vs bespoke — S25 OQ3), status variants over the new status tokens, default timeout, optional Undo. Mount app-wide.
   - *Acceptance:* a mutation success raises a toast; auto-dismiss after timeout; Undo invokes the caller-supplied reversal.
   - *Test approach:* component test; this is purely client — **no service-layer test**.

7. **Resolve `popup` recipient rendering (components/product — flagged).** Decide `popup` → Toast vs distinct pop-up (S25 OQ). No service function needed; `popup` deliveries already fan out and list. Implement the chosen renderer; ensure `acknowledgeDelivery` is never called for `popup` (it already refuses non-`acknowledge`).
   - *Acceptance:* a `popup`-presentation delivery surfaces transiently and still appears in the inbox; never stamps `acknowledgedAt`.
   - *Test approach:* E2E; `acknowledgeDelivery`'s presentation guard is already enforced in SQL.

8. **Reminders cron — scope to a BACKEND SPEC (explicit note).** `/api/cron/notifications/reminders` is a **live stub** (`{ok:true,sent:0}`). Activating reminder generation (what reminders fire, on what cadence, what `broadcasts`/`required_actions` they read, idempotency) is **server-infrastructure not covered by any S-surface** and is out of scope for this presentation-redesign pass. **Action: do not implement here; capture it in a dedicated backend/cron spec** alongside the dispatch + push drain crons (which are also pure backend infra surfaced only as far as S26 documents them). Keep the stub.
   - *Acceptance:* stub returns 200 under valid `assertCron`; documented as deferred.

**Note on missing service tests:** there is currently **no** unit/integration test for `listInbox`/`markRead`/`publishAnnouncement`/`acknowledgeDelivery` (they hit live Neon; `test-store.ts` mirrors them for E2E). Since the service layer is REUSE-only here, the redesign does not require adding them, but the dispatch/drain crons would benefit from an integration test in any future backend-spec work (out of scope for this pass).

---

## Cross-domain dependencies

- **Users / access-control / auth** — every recipient query is keyed on the camp `userId` from `ensureCampUser`; `resolveAudience`/`computeAudience` read `users` (`isSystem`, `sanitised`) and exclude the sender. `requireCaptain` (announcements actions) and the route gates depend on `lib/auth` (`getAuthenticatedUser`) + `lib/users` (`ensureCampUser`, `hasCampAccess`, `isApproved`). The **Decision 3 preview-but-locked** gating for S15 reuses the same rank check that the roster/captain-management domain uses (`campUser.rank !== "captain"`). No data coupling beyond reads.
- **Roster / team memberships / drivers** — `resolveAudience` reads `teamMemberships` and `driverProfiles` for non-everyone scopes (unused by S15 everyone-only, but live for scoped sends + the dispatch cron).
- **Required actions / questionnaire (S25 QuestionnaireBlock)** — a *sibling* overlay in S25, **not** part of this domain (reads `required_actions`, not `notification_deliveries`); listed only to disambiguate the shared S25 surface. If QuestionnaireBlock is polled (S25 OQ), it needs its own `/api/.../pending`-style endpoint **mirroring** `/api/notifications/pending` — a pattern this domain establishes but a different domain owns.
- **Voice / dictation (S21)** — S15's `DictatePill` (Decision 5) and S25's feedback dialog consume the shared `RecorderPanel` (S21 domain). This domain only hosts the affordance; transcription backend is the voice domain's.
- **Telegram (cross-domain mirror)** — `/api/cron/telegram/dispatch` calls `@camp404/telegram` `dispatchPendingAnnouncements`, a **parallel** fan-out of the same `broadcasts` rows to Telegram channels (independent of `notification_deliveries`). Any change to broadcast publish semantics must consider this second consumer. Out of scope for this pass (no surface), but a real coupling on the `broadcasts` table.
- **Toast → arbitrary mutations** — the NEW Toast's Undo is mutation-agnostic; whichever surface raises it owns the reversal. No coupling into this domain's data layer.
- **Design tokens** — the NEW status tokens (success/info/warning) that Toast and the S15 banners/pills depend on are owned by `design-tokens.md` (decisions §tokens); a prerequisite for the Toast build, not a service-layer concern.
