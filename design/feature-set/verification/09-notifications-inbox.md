# Verification — 09 notifications-inbox

**Verdict:** accurate  ·  checked 58 claims, verified 57.
The doc is an exceptionally faithful mirror of the source: every file:line cite, enum member list, schema column, query predicate, icon mapping, and gate path was confirmed against real production code. The single non-confirmation is a self-flagged low-confidence aside about a "product-wide max-w-lg shell" that does not actually exist as a global shell — but the page's own `max-w-2xl` is correct, and the doc already hedged it. No high- or medium-severity defects.

## Inaccuracies
| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "this max-w-2xl deviates from the product-wide max-w-lg shell" (line 81, hedged low-confidence) | There is no global `max-w-lg` shell. `max-w-lg` appears only in `not-found.tsx`, `error.tsx`, and `camp-management-roster.tsx` (one occurrence each); the root layout enforces no fixed width. The `max-w-2xl` on the inbox page itself is correct. | `apps/web/app/notifications/page.tsx:40` (max-w-2xl correct); no global max-w-lg shell found in `app/layout.tsx` |

## Omissions
| severity | missing behavior/state/enum | file:line |
|---|---|---|
| (none material) | — | — |

## Spot-confirmed
- **RSC force-dynamic** + metadata: `export const dynamic = "force-dynamic"` and `metadata = { title: "Notifications — Camp 404" }` — `page.tsx:8`, `:10` (em-dash matches).
- **Auth+invite gate, lines 25-29**: `getAuthenticatedUserOrRedirect()` → `ensureCampUser(authUser)` → `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` — `page.tsx:25-29` exact.
- **getAuthenticatedUserOrRedirect redirects unauth**: `if (!user) redirect("/auth/sign-in")` — `apps/web/lib/auth.ts:40-44`.
- **Snapshot-then-mark-read, lines 31-37**: `const items = await listInbox(campUser.id)` then `await markRead(campUser.id, items.map((i) => i.id))` — `page.tsx:33-37` exact.
- **Gate asymmetry confirmed**: home spine re-gates `getPendingRequiredActions`/`nextGate` (`page.tsx:47-48`), legacy `completedAt` (`:53-55`), and `isApproved` → `/pending-approval` (`:61-63`) at `app/page.tsx:44-63`; the notifications page runs none of these — only auth + `hasCampAccess`. Verified by reading both files.
- **Back-to-home link**: ghost `Button asChild size="sm"` wrapping `<a href="/">` with `ChevronLeft` + "Home" — `page.tsx:41-45`.
- **Header block copy**: `<h1>` "Notifications"; subtitle "Everything that's been sent your way." — `page.tsx:47-50`.
- **Empty state**: `items.length === 0` → muted `<p>` "No notifications yet." — `page.tsx:53-54`.
- **presentationIcon mapping**: `acknowledge`→`Megaphone`, `popup`→`MessageSquare`, fallback (feed)→`Bell`, all `h-4 w-4 aria-hidden`, in a `text-muted-foreground` span — `page.tsx:18-22`, `:71-72`.
- **isNew flag**: `const isNew = item.readAt === null` — `page.tsx:58`; emphasised class `border-[color:var(--color-primary)]/40 bg-accent/20` (`:64-66`); "New" pill `bg primary`/`text primary-foreground` `text-[10px]` (`:77-81`).
- **Date display**: `new Date(item.createdAt).toLocaleDateString()` inside `<time>` (date-only) — `page.tsx:83-85`.
- **Body**: `whitespace-pre-wrap` muted `<p>` rendering `item.body` verbatim, no markdown — `page.tsx:87-89`.
- **Sender + ack attribution, lines 90-99**: rendered only `item.senderName &&`; "From {senderName}" then `acknowledgedAt` → " · acknowledged", else `presentation === "acknowledge"` → " · awaiting acknowledgement", else "" — `page.tsx:90-99` exact; precedence (acknowledged wins) confirmed.
- **Header bell link**: `next/link` (`Link`) to `/notifications`, `Bell` `h-5 w-5`; `aria-label` `"Notifications (${notifications} unread)"` when truthy else `"Notifications"` — `home-header.tsx:26-35`.
- **Unread badge**: rendered only on truthy `notifications`; `bg primary`/`text primary-foreground` `text-[10px]`, top-right; `notifications > 99 ? "99+" : notifications` — `home-header.tsx:36-43`, cap at `:41`. Prop doc'd "Falsy hides the badge." at `:13`.
- **Badge source**: `const unreadPromise = countUnread(campUser.id)` at `app/page.tsx:68`; awaited at `:80` (`const unreadNotifications = await unreadPromise`); passed `notifications={unreadNotifications}` at `:91`. All three cited lines exact.
- **Facade real-vs-test split**: `backend()` returns `testBackend` when `isE2ETestMode()` else `realBackend` — `notifications.ts:117-119` (doc cites 71-119 for the whole split block; the selector is 117-119); inbox exports `countUnread` (`:121-123`), `listInbox` (`:125-127`), `markRead` (`:129-131`) exact.
- **Page imports only inbox fns from facade**: `import { listInbox, markRead, type InboxItem } from "@/lib/notifications"` — `page.tsx:4`; never imports `@camp404/db/broadcasts` directly. `acknowledgeDelivery` not invoked by this page (callers are `acknowledgement-gate.tsx`, `api/notifications/acknowledge`, `api/notifications/pending`).
- **listInbox query**: selects delivery `id,title,body,presentation,readAt,acknowledgedAt,createdAt` + `senderName: users.displayName`; `from notificationDeliveries` LEFT JOIN broadcasts on `broadcasts.id = deliveries.broadcastId` LEFT JOIN users on `users.id = broadcasts.senderId`; `where userId` ; `orderBy desc(createdAt)`; `createHttpDb()` — `broadcasts.ts:472-493` exact.
- **markRead**: `if (ids.length === 0) return;` then UPDATE `readAt = new Date()` where `userId` AND `inArray(id, ids)` AND `isNull(readAt)` — `broadcasts.ts:516-529` exact (idempotent, owner-scoped, only-if-unread).
- **countUnread**: `count(*)::int` where `userId` AND `isNull(readAt)`; `row?.count ?? 0` — `broadcasts.ts:496-508` exact.
- **InboxItem interface**: `{ id, title, body, presentation: AnnouncementPresentation, senderName: string|null, readAt: Date|null, acknowledgedAt: Date|null, createdAt: Date }` — no `channel`/`refType`/`refId`/`pushStatus`/`broadcastId` — `broadcasts.ts:460-469` exact.
- **AnnouncementPresentation** = `(typeof broadcastPresentationEnum.enumValues)[number]` — `broadcasts.ts:29-30`.
- **Test-store listInbox/countUnread/markRead**: `:514-542` / `:543-546` / `:547-556` — filter by `userId`, sort `b.createdAt.getTime() - a.createdAt.getTime()` (newest first), senderName resolved from parent broadcast's sender displayName (NULL if no sender); countUnread `readAt === null`; markRead empty no-op + Set-membership + owner+unread guard. `test-store.ts:514-556` exact.
- **TestPresentation** = `"acknowledge" | "popup" | "feed"` — `test-store.ts:59`. `TestBroadcast`/`TestDelivery` fields match doc (no channel/pushStatus/refType/refId/deliveredAt) — `test-store.ts:64-84`.
- **Enums**: `broadcast_presentation ["acknowledge","popup","feed"]` (`schema.ts:166-170`); `notification_channel ["push","in_app","both"]` (`:144-148`); `broadcast_kind ["announcement","team_message","lead_directive","reminder","system"]` (`:128-134`); `broadcast_scope ["everyone","team","team_leads","drivers","individual"]` (`:136-142`); `push_delivery_status ["queued","sent","failed","skipped"]` (`:150-155`). All member lists exact, all counts correct.
- **Column-level presentation default `"feed"`**: broadcasts `:783-785`, deliveries `:846-848` — both `.notNull().default("feed")`.
- **notification_deliveries table** `schema.ts:830-887`: `id` uuid `defaultRandom` PK; `broadcastId` → broadcasts.id `onDelete: cascade` nullable; `userId` → users.id `onDelete: cascade` notNull; `title`/`body` text notNull; `channel` notNull (no default — doc says "required on deliveries", correct, vs broadcasts default "both"); `presentation` notNull default feed; `pushStatus` notNull default queued; `refType` text / `refId` uuid nullable; `readAt`/`acknowledgedAt`/`deliveredAt` nullable timestamps; `createdAt` notNull defaultNow. All exact.
- **Indexes**: `notification_deliveries_user_read_idx (userId, readAt)`; `notification_deliveries_user_ack_idx (userId, acknowledgedAt)`; `notification_deliveries_broadcast_idx (broadcastId)`; partial unique `notification_deliveries_broadcast_user_uniq (broadcastId, userId) WHERE broadcastId IS NOT NULL` — `schema.ts:864-886` exact.
- **broadcasts table** `schema.ts:763-807`: `senderId` → users.id `onDelete: "set null"` nullable — `:767-769`; confirms doc's "sender deleted → set null → NULL senderName" path.
- **users fields**: `displayName` text `:223`; `isSystem` boolean `:234`; `sanitised` boolean `:279`; `inviteCode` text `:260`; `profileImageUrl` `:229`. The doc's "~:223, :234, :279" cites land exactly.
- **hasCampAccess**: `isGodEmail(email) || !!user.inviteCode` — `users.ts:219-224` exact; `isGodEmail` imported from `./access-control` (`users.ts:26`).
- **acknowledgeDelivery (read≠ack boundary)**: stamps both `acknowledgedAt` AND `readAt`, gated `presentation = "acknowledge"` AND `isNull(acknowledgedAt)`, owner-scoped — `broadcasts.ts:437-458`; confirms the inbox's `markRead` (readAt-only) is a strictly distinct write path.
- **No pagination/LIMIT**: `listInbox` has no `.limit()`/offset in either backend — `broadcasts.ts:472-493`, `test-store.ts:514-542`. Confirmed unbounded.

## Low-confidence / could-not-verify
- **"product-wide max-w-lg shell" (page.tsx:40 aside, line 81)**: Could not confirm a global `max-w-lg` shell; `max-w-lg` appears in only three unrelated screens and the root layout sets no fixed container width. The doc self-flagged this as low-confidence, and the page's actual `max-w-2xl` is verified — so this is a cosmetic mis-characterisation of the surrounding product, not of this surface.
- **Cross-unit attributions (units 25 / 27)**: The doc defers acknowledgement stamping to unit 25 (ack gate) and fan-out to unit 27. Spot-confirmed that `acknowledgeDelivery`/`getPendingAcknowledgements` callers live in `acknowledgement-gate.tsx` + the two `api/notifications/*` routes (not this page), but full verification of units 25/27 is out of scope for this doc.
- **toLocaleDateString locale**: runtime-/locale-dependent output is inherently not statically verifiable; the code call (`page.tsx:84`) and the doc's "date-only, locale-formatted" description match.
