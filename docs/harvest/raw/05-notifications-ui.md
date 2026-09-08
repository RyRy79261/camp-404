# Unit 05 — Notifications UI (bell, panel, rows, filters, grouping)

HARVEST doc. Donor = quagga-portal / AfrikaBurn Contributors App at
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
(all paths below are relative to that root unless prefixed `camp-404/`).
Target = Camp 404 at `/home/ryan/repos/Personal/camp-404`.

Everything here is source-verified with `path:line`. Where I could not confirm something I
say so explicitly.

---

## 1. Purpose

The donor ships a complete, production, three-app **notification inbox**: a header bell with an
unread badge, a lazy-loading dropdown panel, a full `/notifications` page with URL-driven filter
tabs, day-grouped rows, per-row read-on-open, and mark-all-read — plus the pure domain layer
under it (payload builders, day grouping, unread predicate, immediate-email gating, a
cross-app link-locality rule) and the DB spine (`notifications` + `bulletins`).

Its own spec states the model in one line: **"Two kinds, one inbox"** — personal event
notifications and org `bulletin` broadcasts share a single `notifications` table and a single
stream (`docs/notifications-spec.md:18`).

Why this matters for Camp 404: Camp 404 already has a **real notifications engine**
(`packages/db/src/broadcasts.ts`: `resolveAudience`, `dispatchDueBroadcasts`, `listInbox`,
`countUnread`, `markRead`) and a `/notifications` page — but its **inbox UI is the thinnest
possible version**:

- the bell is a plain `<a href="/notifications">` with a badge inside `TopChrome`
  (`camp-404/packages/ui/src/components/top-chrome.tsx:49-64`) — no panel, no popover;
- `camp-404/apps/web/app/notifications/page.tsx:28-32` reads the whole inbox and then
  **marks everything read on page load** — there is no per-row read, no mark-all-read control,
  no filter tabs, and no day grouping;
- the row is `camp-404/apps/web/app/notifications/notification-row.tsx` (75 lines) with a
  3-glyph presentation map (`presentation-meta.ts:9-15`) and a `formatRelativeTime`
  (`presentation-meta.ts:21-33`) that stops at `"2d ago"`;
- `camp-404/apps/web/app/notifications/page.tsx` is one of the pages WP2 (#126) flags for
  skipping the `isApproved` gate every sibling enforces.

So the donor's unit 05 is close to a straight upgrade path for a surface Camp 404 already owns
the backend for. The donor's inbox is also **not multi-tenant-coupled**: unlike almost every
other donor subsystem, the notification row carries no `group_id` and no `edition_id`.

---

## 2. File inventory (with line counts)

### 2.1 Shared package — `@quagga/ui` (the genuinely shared half)

| File | Lines | What |
|---|---|---|
| `packages/ui/src/components/notification-bell.tsx` | 53 | Stateless bell + unread badge, `count`/`max` props |
| `packages/ui/src/components/notification-item.tsx` | 144 | The row's presentation + `NOTIFICATION_KIND_ICON` map |
| `packages/ui/src/components/popover.tsx` | 54 | Radix Popover wrapper the panel anchors in |
| `packages/ui/src/components/tabs.tsx` | 54 | Radix Tabs wrapper the filter tabs use (`asChild` `<Link>`s) |
| `packages/ui/src/components/skeleton.tsx` | 204 | `Skeleton` / `SkeletonRegion` kit every `loading.tsx` uses |
| `packages/ui/src/components/empty-state.tsx` | 52 | Empty-state used by all three inbox pages |
| `packages/ui/src/components/toast.tsx` | (n/a to unit) | `toast.success/error` used by mark-all-read |
| `packages/ui/src/components/bulletin-card.tsx` | 115 | Bulletin card + read-rate bar (adjacent surface) |
| `packages/ui/src/components/pinned-bulletin-banner.tsx` | 63 | Pinned-bulletin banner (adjacent surface) |
| `packages/ui/src/lib/bulletin.ts` | 24 | `readRate()` pure maths |

### 2.2 Shared package — `@quagga/core` / `@quagga/types`

| File | Lines | What |
|---|---|---|
| `packages/core/src/notifications.ts` | 412 | Payload builders, day grouping, unread, link-app rules, email gating, privacy guard |
| `packages/core/src/security-notifications.ts` | 334 | Security-event notification + Resend email builders, `maskEmail`, leak guard |
| `packages/types/src/notifications.ts` | 58 | `NotificationKind`, `NotificationPayload`, `BulletinComposeInput`, `NotificationFilter` |
| `packages/core/src/audience.ts` | 313 | `resolveAudience` (bulletins' second consumer) — **org/tenant-coupled** |
| `packages/types/src/audience.ts` | 191 | `AudienceSpec` — **org/tenant-coupled** |

### 2.3 apps/web (participant) — the reference implementation

| File | Lines | What |
|---|---|---|
| `apps/web/components/notifications/format.ts` | 172 | `relativeTime`, `sourceLabel`, `dayGroupHeading`, `isBlockingNotification`, `toRowItem` |
| `apps/web/components/notifications/notification-panel.tsx` | 110 | Popover panel, lazy load-on-open |
| `apps/web/components/notifications/notification-row.tsx` | 67 | Interactive row: optimistic read + link follow |
| `apps/web/components/notifications/notification-day-groups.tsx` | 32 | Day-group section list |
| `apps/web/components/notifications/filter-tabs.tsx` | 59 | All / Unread·n / Bulletins as URL links |
| `apps/web/components/notifications/mark-all-read-button.tsx` | 55 | Ghost button + success/error toasts |
| `apps/web/components/header-notification-bell.tsx` | 15 | One-line pass-through to the panel |
| `apps/web/app/(app)/notifications/page.tsx` | 118 | The inbox page (server) |
| `apps/web/app/(app)/notifications/loading.tsx` | 45 | Route skeleton |
| `apps/web/app/(app)/notifications/actions.ts` | 21 | `fetchRecentNotifications()` — panel feed, no input |
| `apps/web/lib/notifications.ts` | 163 | Reads + `insertNotifications` (chunked) |
| `apps/web/lib/notifications-actions.ts` | 80 | `markNotificationRead`, `markAllNotificationsRead` |
| `apps/web/lib/bulletins.ts` | 93 | Bulletin read-side audience enforcement |
| `apps/web/components/app-shell.tsx` | 139 | Where the bell is mounted (`:97`) |
| `apps/web/app/api/notifications/digest/route.ts` | 36 | **Declared design stub** — returns JSON, sends nothing |

### 2.4 apps/org (console) — the fork

| File | Lines | Notable divergence |
|---|---|---|
| `apps/org/components/notifications/notification-panel.tsx` | 105 | Same panel; `text-accent` not `text-primary`; no `<li>` wrapper |
| `apps/org/components/notifications/notification-row.tsx` | 85 | `role="button"` div inside `<li>`, hand-rolled Enter/Space keydown, prop **spread** not `item` object, **no optimistic read state** |
| `apps/org/components/notifications/mark-all-read-button.tsx` | 49 | **Lost the success toast** — `disabled?: boolean` prop instead of `unreadCount` |
| `apps/org/components/notifications/relative-time.ts` | 41 | `timeAgo()` (different name, different >24h behaviour) + `NOTIFICATION_SOURCE_LABELS` |
| `apps/org/components/header-notification-bell.tsx` | 13 | Pass-through |
| `apps/org/app/(console)/notifications/page.tsx` | 136 | Hand-rolled pill nav instead of Radix Tabs; no `dayGroupHeading` |
| `apps/org/app/(console)/notifications/loading.tsx` | 37 | Skeleton |
| `apps/org/lib/notifications.ts` | 149 | Triplicate of web's, `"org"` slug, `userId` param |
| `apps/org/lib/actions/notifications.ts` | 86 | Triplicate + `fetchRecentNotifications` projecting `NotificationRowProps` |

### 2.5 apps/suppliers (portal) — the second fork

| File | Lines | Notable divergence |
|---|---|---|
| `apps/suppliers/components/notifications/format.ts` | 101 | `relativeTime` adds a `"Yesterday"` branch web lacks (`:30`); `PORTAL_SOURCE = "AfrikaBurn"` constant instead of `sourceLabel()`; **no `blocking` field** on the row item |
| `apps/suppliers/components/notifications/notification-panel.tsx` | 106 | Same panel |
| `apps/suppliers/components/notifications/notification-row.tsx` | 77 | Same as web's but stuffs `body` into `meta` as JSX instead of using `NotificationItem`'s `body` prop |
| `apps/suppliers/components/notifications/filter-tabs.tsx` | 59 | **Byte-identical to web's** apart from the canvas id in the comment |
| `apps/suppliers/components/notifications/mark-all-read-button.tsx` | 56 | Same as web's (early-return instead of else) |
| `apps/suppliers/components/header-notification-bell.tsx` | 14 | Pass-through |
| `apps/suppliers/app/(portal)/notifications/page.tsx` | 123 | Same shape as web's; inlines the day-group list |
| `apps/suppliers/app/(portal)/notifications/loading.tsx` | 36 | Skeleton |
| `apps/suppliers/lib/notifications.ts` | 193 | Triplicate + `SupplierBulletin`/`getBulletinForSupplier` (`:161`) |
| `apps/suppliers/lib/actions/notifications.ts` | 77 | Triplicate |

### 2.6 Tests

| File | Lines |
|---|---|
| `packages/core/src/__tests__/notifications.test.ts` | 373 |
| `packages/core/src/__tests__/security-notifications.test.ts` | 187 |
| `apps/web/lib/__tests__/notifications-inbox.test.ts` | 325 |
| `apps/org/lib/__tests__/console-notifications.test.ts` | 316 |
| `apps/suppliers/lib/__tests__/notifications.test.ts` | 293 |
| `apps/suppliers/lib/__tests__/notification-actions.test.ts` | 198 |
| `packages/ui/src/components/__tests__/tier2-3.test.tsx` | (NotificationItem block at `:25-57`) |
| `packages/ui/src/components/__tests__/form-controls.test.tsx` | (NotificationBell block at `:90-107`) |

**Total for the subsystem: ~4,000 lines of source + ~1,700 lines of test.**

### 2.7 DB + migrations

- `packages/db/src/schema.ts:229-238` — `notificationKindEnum`
- `packages/db/src/schema.ts:1748-1775` — `bulletins`
- `packages/db/src/schema.ts:1841-1892` — `notifications`
- `packages/db/migrations/0009_left_blue_shield.sql` — creates both tables + the enum + 4 indexes
- `packages/db/migrations/0021_demonic_starhawk.sql` — adds `origin` + `link_app` (2 statements, 22 lines of comment first)

---

## 3. Capability list (exhaustive, each cited)

### Bell + badge
1. Bell renders a badge only when `count > 0`; negative and fractional counts are floored/clamped via `Math.max(0, Math.floor(count))` (`packages/ui/src/components/notification-bell.tsx:21`).
2. Display cap: `unread > max ? `${max}+` : String(unread)`, `max` defaults to **99** (`notification-bell.tsx:14, :22`).
3. `aria-label` states the count in words: `"Notifications, ${unread} unread"` vs `"Notifications, none unread"` (`notification-bell.tsx:23-26`).
4. Bell is a `forwardRef` `<button type="button">` with no hooks, so it is **server-component-safe** and can be a Radix `PopoverTrigger asChild` (`notification-bell.tsx:17-20, :29-31`).
5. Badge is `bg-destructive` / `text-destructive-foreground`, `h-4 min-w-4`, `text-[10px]`, pinned `absolute right-1 top-1` (`notification-bell.tsx:43`).
6. The badge count is computed on the **server render of the layout**, not by the client panel, so it is correct before any interaction (`apps/web/components/app-shell.tsx:66-69`, `apps/web/components/notifications/notification-panel.tsx:27-28` comment).
7. The bell is rendered only for signed-in, non-gated viewers (`app-shell.tsx:91-99`).

### Row presentation (`NotificationItem`)
8. Exhaustive `kind → lucide icon` map, one distinct icon each: `registration: PartyPopper`, `wrangler: Compass`, `role: UserCheck`, `questionnaire: ClipboardList`, `supplier: Package`, `security: ShieldAlert`, `bulletin: Megaphone` (`packages/ui/src/components/notification-item.tsx:36-44`).
9. Read state dims the whole row (`opacity-70`) and downgrades title weight from `font-medium text-foreground` to `font-normal text-muted-foreground` (`notification-item.tsx:93, :112-117`).
10. Unread dot: `aria-label="Unread"`, `h-2 w-2 rounded-full bg-primary`, rendered only when `!read` (`notification-item.tsx:136-141`).
11. `body` renders under the title with `whitespace-pre-line` — added specifically so a **reviewer's rejection reason** is not silently discarded (`notification-item.tsx:53-59, :121-125`).
12. Blocking flag: only when `blocking && kind === "questionnaire"` (`notification-item.tsx:87`). It (a) recolours the glyph circle to `bg-destructive/15 text-destructive` (`:102-104`) and (b) renders the literal line **"Required · blocks registration"** in `text-xs font-semibold uppercase tracking-wide text-destructive` (`:126-130`).
13. Meta line derivation: `meta ?? ([timeAgo, source].filter(Boolean).join(" · ") || null)` — an explicit `meta` node overrides the derived string (`notification-item.tsx:85-86`).
14. Presentational + hookless, spreads div attributes, owns no list styling — so it can live inside a parent's `<li>` or a client `<button>` (`notification-item.tsx:14-18`).

### Time + source formatting (`format.ts`)
15. `relativeTime` ladder (web): `< 60_000` → `"Just now"`; `< 1h` → `"N minute(s) ago"`; `< 24h` → `"N hour(s) ago"`; `< 7d` → `en-GB` weekday short (`"Mon"`); else `en-GB` `{day:"numeric", month:"short"}` (`"12 Feb"`) (`apps/web/components/notifications/format.ts:11-34`).
16. Singular/plural is explicit: `${mins} minute${mins === 1 ? "" : "s"} ago` (`format.ts:24, :28`).
17. `sourceLabel(kind, origin)`: `origin === "org"` → `"AfrikaBurn"`; `origin === "camp" || "system"` → `null`; otherwise fall back to a kind allow-list (`format.ts:71-78`).
18. `ALWAYS_ORG_SOURCED = new Set(["bulletin", "registration", "wrangler", "supplier"])` — `questionnaire`, `role` and `security` are **deliberately absent** (`format.ts:44-50`).
19. The reason is documented as a real incident: a camp lead's questionnaire showed `"2 hours ago · AfrikaBurn"` under a title naming the camp. "With no origin recorded we now say nothing rather than guess." (`format.ts:58-69`).
20. `dayGroupHeading(label)`: matches `/^(\d{4})-(\d{2})-(\d{2})$/`; non-match → `label.toUpperCase()` (so `"Today"` → `"TODAY"`); match → `en-GB` `{weekday:"short", day:"numeric", month:"short"}` uppercased (`"MON 20 JUL"`) (`format.ts:85-97`).
21. **`BLOCKING_MARKER = "REQUIRED, blocks registration"`** — the stored row carries no blocking flag, so this phrase IS the wire format (`format.ts:99-115`).
22. `toRowItem(view, now)` projects a stored row into a serialisable display row on the server, so relative time can never hydrate-mismatch (`format.ts:133-171`).
23. `toRowItem` trims and null-collapses the body: `body: view.body?.trim() || null` (`format.ts:166`).
24. Org's variant is a **different function with different behaviour**: `timeAgo` returns `"Yesterday"` at day 1, `"N days ago"` under 30 days, then an **en-ZA** `{day:"2-digit", month:"short", year:"numeric"}` date (`apps/org/components/notifications/relative-time.ts:11-30`).
25. Org additionally has `NOTIFICATION_SOURCE_LABELS` — a full `Record<NotificationKind, string>` of console-flavoured labels: `registration:"Registrations"`, `wrangler:"Wranglers"`, `role:"Officers"`, `questionnaire:"Questionnaires"`, `supplier:"Suppliers"`, `security:"Security"`, `bulletin:"Bulletins"` (`relative-time.ts:33-41`).
26. Suppliers' variant inserts a `"Yesterday"` branch web lacks (`< 2 * DAY`) and hardcodes `PORTAL_SOURCE = "AfrikaBurn"` for every row (`apps/suppliers/components/notifications/format.ts:30, :41, :97`).

### Day grouping
27. `groupNotificationsByDay<T extends {createdAt: Date}>(items, now = new Date())` — pure, `now` injectable (`packages/core/src/notifications.ts:390-411`).
28. Assumes items are already newest-first and does a **single linear pass**, opening a new group whenever the day key changes (`notifications.ts:399-410`).
29. Day key is **local-calendar** `YYYY-MM-DD` built from `getFullYear/getMonth/getDate` (not UTC, not ISO) (`notifications.ts:378-383`).
30. Only the two most recent calendar days get words: `"Today"` / `"Yesterday"`; everything else keeps the raw key as its label (`notifications.ts:404-405`).
31. Yesterday is computed with `new Date(now); setDate(getDate() - 1)` — month/year rollover handled by the platform (`notifications.ts:395-397`).
32. `DayGroup<T> = { key: string; label: string; items: T[] }` (`notifications.ts:370-376`).

### Filter tabs
33. Three tabs in fixed order: `TAB_ORDER = ["all", "unread", "bulletins"]`, labels `All` / `Unread` / `Bulletins` (`apps/web/components/notifications/filter-tabs.tsx:16-22`).
34. Filter state lives in the **URL**, not client state — every trigger is a `<Link>` inside a Radix `TabsTrigger asChild`, so a filtered inbox is linkable and back-button-friendly and the list stays a server render (`filter-tabs.tsx:10-14, :42-50`).
35. `notificationsHref(filter)`: `"all"` → `/notifications`; otherwise `/notifications?filter=${filter}` (`filter-tabs.tsx:25-29`).
36. Unread tab shows `· n` in `tabular-nums text-muted-foreground` only when `unreadCount > 0` (`filter-tabs.tsx:45-49`).
37. Empty `<TabsContent>` panels are rendered for every tab **solely so each trigger's `aria-controls` resolves** (`filter-tabs.tsx:13-14, :54-56`).
38. Org does NOT use this component — it hand-rolls a rounded-full pill nav with `aria-current="page"` inside `<nav aria-label="Filter notifications">` (`apps/org/app/(console)/notifications/page.tsx:62-90`).

### Panel (dropdown)
39. Non-modal by choice: Radix **Popover**, not Dialog, so the page behind stays undimmed and interactive while still getting focus management and Escape/outside-click dismissal (`apps/web/components/notifications/notification-panel.tsx:20-24`).
40. Anchored `align="end"`, `sideOffset={8}`, labelled by a `React.useId()` heading (`notification-panel.tsx:57-66`).
41. Width: `w-[min(26rem,calc(100vw-1rem))]`, list capped at `max-h-[60vh] overflow-y-auto` (`notification-panel.tsx:30-32, :74`).
42. **Lazy load on open** via `useEffect` keyed on `[open, nonce]`, with a `cancelled` guard on unmount — costs nothing on pages nobody opens it from (`notification-panel.tsx:41-50`).
43. Three render states: `items === null` → `"Loading…"`; `items.length === 0` → app-specific empty sentence; else the list (`notification-panel.tsx:75-94`).
44. A `nonce` counter forces a refetch after mark-all-read (`notification-panel.tsx:38, :70`).
45. Opening a row closes the panel via `onOpen={() => setOpen(false)}` (`notification-panel.tsx:89`).
46. Footer: `"All notifications →"` link to `/notifications` that also closes the panel (`notification-panel.tsx:97-106`).
47. Panel item count is **6**, set by the server action (`apps/web/app/(app)/notifications/actions.ts:18`; `recentNotifications(limit = 6)` at `apps/web/lib/notifications.ts:97-98`).

### Row interaction
48. Optimistic read: `const [opened, setOpened] = React.useState(false); const read = item.read || opened;` — **derived, not seeded**, so a server refresh still wins (`apps/web/components/notifications/notification-row.tsx:28-31`).
49. Short-circuit: `if (read && !item.link) return row;` — an already-read, linkless row renders as an inert div with no button wrapper (`notification-row.tsx:45-46`).
50. On click: set optimistic read → fire `onOpen` → inside `startTransition`, mark read **only if `!item.read`**, then `router.push(item.link)` or `router.refresh()` (`notification-row.tsx:52-61`).
51. `disabled={pending}` + `disabled:opacity-70` while the transition runs (`notification-row.tsx:51, :62`).
52. Focus ring: `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`, hover `bg-muted/40` (`notification-row.tsx:62`).
53. Org's row instead uses `role="button" tabIndex={0}` on a div with a hand-rolled `onKeyDown` for `Enter`/`" "` and `aria-busy={pending || undefined}` — and has **no optimistic read state at all** (`apps/org/components/notifications/notification-row.tsx:50-64`).

### Mark all read
54. Button is `variant="ghost" size="sm"` with a `CheckCheck` icon and the literal label `"Mark all read"` (`apps/web/components/notifications/mark-all-read-button.tsx:28-53`).
55. Disabled when `pending || unreadCount === 0` — it never offers an action that would do nothing (`mark-all-read-button.tsx:32`).
56. Success toast is `toast.success("All caught up", { description: "Every notification is marked read." })`, then `router.refresh()`, then `onDone?.()` (`mark-all-read-button.tsx:38-42`).
57. Failure toast is `toast.error("Could not mark them read", { description: result.error })` (`mark-all-read-button.tsx:44-46`).
58. Rendered in **two** places: the page toolbar (`apps/web/app/(app)/notifications/page.tsx:103`) and the panel header (`notification-panel.tsx:67-71`).
59. **Org's copy silently lost the success toast** — verified: `apps/org/components/notifications/mark-all-read-button.tsx:33-42` has only `toast.error`. The audit confirms this at `docs/simplification-audit.md:289`.

### Inbox page
60. `export const dynamic = "force-dynamic"` on all three inbox pages (`apps/web/app/(app)/notifications/page.tsx:25`, `apps/org/...:26`, `apps/suppliers/...:33`).
61. Web's gate ladder: `getAuthenticatedUser()` → redirect `/auth/sign-in`; `isDatabaseConfigured()` → `<PreviewNotice feature="Notifications"/>`; `requireCampUser()`; then **`await enforceGate(user.id)`** — "a pending blocking action outranks the inbox" (`page.tsx:55-64`).
62. Zod at the boundary, **non-throwing**: `NotificationFilter.safeParse(rawFilter)` falling back to `"all"` "(a shared link with a stale param should still open the inbox)" (`page.tsx:68-70`). Org and suppliers instead use `NotificationFilter.catch("all").parse(rawFilter ?? "all")` (`apps/org/...:44`, `apps/suppliers/...:69`).
63. Unread count and groups are fetched with `Promise.all` (`page.tsx:72-75`).
64. A single `const now = new Date()` is threaded into every `toRowItem`, so every row on the page shares one clock (`page.tsx:77-81`).
65. **Per-filter empty-state copy** — three distinct icon+title+description triples (`page.tsx:27-48`): `all` → Inbox / "Nothing here yet"; `unread` → BellOff / "You're all caught up"; `bulletins` → Megaphone / "No bulletins yet".
66. Page copy states the product law: *"This is the source of truth; email is just a nudge."* (`page.tsx:96-98`).
67. Route skeleton exists for all three inboxes and deliberately renders **rows, not cards** — "a grid of card placeholders would be a lie that reflows" (`apps/web/app/(app)/notifications/loading.tsx:4-9`).

### Reads / writes (per-app lib)
68. `getUnreadNotificationCount()` — `count(*)::int` over `(userId, readAt IS NULL)`; returns `0` env-less or signed out **without touching the DB** (`apps/web/lib/notifications.ts:28-42`).
69. `listNotificationGroups(filter)` — conditions built as an array; `unread` adds `isNull(readAt)`, `bulletins` adds `eq(kind, "bulletin")`, `all` adds nothing; `orderBy(desc(createdAt))`, **`.limit(200)`** (`apps/web/lib/notifications.ts:60-94`).
70. `recentNotifications(limit = 6)` — flat, newest-first, **no filter** (`apps/web/lib/notifications.ts:97-122`).
71. Both reads apply `notificationLinkIsLocal(r.linkApp, "web") ? r.link : null` — a link minted for another app renders as an unlinked row rather than a guaranteed 404 (`apps/web/lib/notifications.ts:88, :117`).
72. `insertNotifications(handle, rows)` — accepts an **explicit db handle** so a caller inside a transaction reuses it; no-op on empty (`apps/web/lib/notifications.ts:134-162`).
73. **Chunked insert**: `NOTIFICATION_INSERT_CHUNK = 1000`, sliced loop (`apps/web/lib/notifications.ts:126, :144-145`).
74. Server actions `markNotificationRead` / `markAllNotificationsRead` return `{ok:true} | {ok:false; error}` and always `revalidatePath("/notifications")` + `revalidatePath("/", "layout")` (the second is what refreshes the header badge) (`apps/web/lib/notifications-actions.ts:15-80`).
75. Both actions call `unstable_rethrow(err)` before building an error string, so `redirect()`/`notFound()` control flow is never rendered as the literal text `"NEXT_REDIRECT"` (`notifications-actions.ts:41-42, :70-71`).
76. `fetchRecentNotifications()` takes **no arguments at all** — "there is no id to validate and no way to ask for someone else's rows" (`apps/web/app/(app)/notifications/actions.ts:9-12`).

### Domain layer (`@quagga/core`)
77. Nine payload builders, each returning a `NotificationPayload`: `registrationDecisionNotification` (`:52`), `questionnaireReleasedNotification` (`:91`), `officerAssignmentRequestNotification` (`:109`), `officerAcceptedNotification` (`:123`), `wranglerAssignedNotification` (`:138`), `supplierStandingNotification` (`:152`), `supplierStepConfirmedNotification` (`:164`), `supplierStepReopenedNotification` (`:183`), `bulletinNotification` (`:201`).
78. `isUnread(n) => n.readAt === null` — a pure mirror of the SQL predicate so the two "can never drift" (`packages/core/src/notifications.ts:352-359`).
79. `countUnread(list)` — the badge number, as a reduce (`notifications.ts:362-366`).
80. `shouldSendImmediateEmail(kind, opts)` — `true` for `registration`; `true` for `questionnaire` **only** when `opts.blocking === true`; `false` for everything else (`notifications.ts:320-327`).
81. `notificationMentionsAny(payload, needles)` — lowercased haystack of `title\nbody\nlink`; **blank/whitespace needles are ignored** so they cannot false-positive (`notifications.ts:337-348`).
82. `resolveNotificationLinkApp(linkApp, writingApp)` — `undefined` → the writing app, explicit `null` → stays `null` (`notifications.ts:259-264`).
83. `notificationLinkIsLocal(linkApp, thisApp)` — `!linkApp || linkApp === thisApp` (`notifications.ts:274-279`).
84. `buildBulletinNotifications({bulletinId, title}, userIds)` — one row per resolved recipient, all sharing one payload (`notifications.ts:297-310`).
85. `resolveBulletinAudience(spec, ctx)` — a thin, deliberate alias of `resolveAudience` so bulletins and questionnaires share **one** resolver (`notifications.ts:286-291`).

### Security-event notifications (auth-adjacent, provider-agnostic)
86. Ten in-app security payload builders: `passwordChangedNotification` (`:31`), `passwordResetCompletedNotification` (`:41`), `emailChangeRequestedNotification` (`:55`), `emailChangeCompletedNotification` (`:67`), `emailChangeRevokedNotification` (`:79`), `newDeviceSignInNotification` (`:92`), `deletionRequestedNotification` (`:108`), `deletionCancelledNotification` (`:120`), `deletionCompletedNotification` (`:134`) — all in `packages/core/src/security-notifications.ts`.
87. Nine matching Resend email bodies with `{kind, subject, text}` (`security-notifications.ts:145-310`).
88. `maskEmail("alice@example.com") === "a…@example.com"` — first grapheme of the local part (`[...local][0]`, so surrogate-pair safe) + full domain; `"…"` when there is no `@` at index > 0 (`security-notifications.ts:161-168`).
89. `ACCOUNT_SECURITY_PATH = "/account/security"`, `ACCOUNT_PATH = "/account"` — path constants so links stay consistent across apps (`security-notifications.ts:27-28`).
90. `formatWhen(when)` is deliberately **timezone-explicit, locale-free**: `when.toISOString().slice(0,16).replace("T"," ")` + `" UTC"` (`security-notifications.ts:313-315`).
91. `securityMessageLeaks(message, forbidden)` — `JSON.stringify(message).toLowerCase()` haystack; empty needle list returns `false` (`security-notifications.ts:324-333`).
92. Stated law: *"a notification is a statement of fact. Never emit a 'changed' message for something that did not change."* Where a provider capability is missing the flow **fails closed and emits nothing** (`security-notifications.ts:16-20`).

---

## 4. Data model (verbatim)

### Enum — `packages/db/src/schema.ts:229-238`

```ts
export const notificationKindEnum = pgEnum("notification_kind", [
  "registration",
  "wrangler",
  "role",
  "questionnaire",
  "supplier",
  "security",
  "bulletin",
]);
```

Mirrored **three** ways and the schema comment says to keep all three in sync
(`schema.ts:225-228`):
- Zod: `packages/types/src/notifications.ts:16-24`
- TS union + icon map: `packages/ui/src/components/notification-item.tsx:26-44`

### Table — `notifications` (`packages/db/src/schema.ts:1841-1892`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK `defaultRandom()` | |
| `user_id` | `uuid` NOT NULL → `users.id` **ON DELETE cascade** | |
| `kind` | `notification_kind` NOT NULL | |
| `title` | `text` NOT NULL | |
| `body` | `text` nullable | |
| `link` | `text` nullable | app-relative path |
| `origin` | `text` nullable | `org` \| `camp` \| `system` — migration 0021 |
| `link_app` | `text` nullable | `web` \| `org` \| `suppliers` — migration 0021 |
| `bulletin_id` | `uuid` nullable → `bulletins.id` **ON DELETE cascade** | |
| `created_at` | `timestamp` NOT NULL `defaultNow()` | |
| `read_at` | `timestamp` nullable | **unread ⇔ NULL** |

Indexes (`schema.ts:1884-1891`):
```ts
userReadIdx: index("notifications_user_read_idx").on(n.userId, n.readAt),
userCreatedIdx: index("notifications_user_created_idx").on(n.userId, n.createdAt.desc()),
```
i.e. one index per query shape — badge count / filter, and inbox list newest-first.

Note `origin` and `link_app` are **plain `text`, not enums** — deliberately, so a staggered
three-app deploy cannot break (`schema.ts:1866-1880`, `migrations/0021_demonic_starhawk.sql:16-20`).

### Table — `bulletins` (`packages/db/src/schema.ts:1748-1775`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `edition_id` | `uuid` NOT NULL → `editions.id` cascade | **edition-scoped — Camp 404 has no editions** |
| `title` | `text` NOT NULL | |
| `body_md` | `text` NOT NULL | markdown |
| `audience` | `jsonb` `.$type<AudienceSpec>()` NOT NULL | same shape as `questionnaire_activations.audience` |
| `created_by_user_id` | `uuid` nullable → `users.id` **ON DELETE set null** | |
| `published_at` | `timestamp` nullable | **null = draft; set on publish = the fan-out trigger** |
| `pinned` | `boolean` NOT NULL default `false` | |
| `created_at` / `updated_at` | `timestamp` NOT NULL `defaultNow()` | |

Indexes: `bulletins_edition_idx(edition_id)`, `bulletins_published_idx(published_at)`.

### Adjacent enum — `securityEventKindEnum` (`packages/db/src/schema.ts:212-222`)

```ts
export const securityEventKindEnum = pgEnum("security_event_kind", [
  "password_changed",
  "password_reset_completed",
  "session_revoked",
  "sessions_revoked_others",
  "email_change_requested",
  "email_change_confirmed",
  "email_change_revoked",
  "deletion_requested",
  "deletion_cancelled",
]);
```
The account security page's feed reads this **real append-only log** rather than deriving it
from `notifications` (`schema.ts:206-211`).

### Zod types — `packages/types/src/notifications.ts`

```ts
export const NotificationPayload = z.object({
  kind: NotificationKind,
  title: z.string().min(1),
  body: z.string().nullable().default(null),
  link: z.string().nullable().default(null),
});                                                    // :33-38

export const BulletinComposeInput = z.object({
  title: z.string().trim().min(1, "Give the bulletin a title.").max(200),
  bodyMd: z.string().trim().min(1, "Write the bulletin body.").max(20000),
  audience: AudienceSpec,
  pinned: z.boolean().default(false),
  publish: z.boolean().default(false),
});                                                    // :47-53

export const NotificationFilter = z.enum(["all", "unread", "bulletins"]);  // :57
```

**Digit-exact limits: title 200 chars, body 20000 chars.**

---

## 5. Public API surface (verbatim signatures)

### `@quagga/ui`
```ts
export interface NotificationBellProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  count?: number;   // default 0
  max?: number;     // default 99
}
const NotificationBell = React.forwardRef<HTMLButtonElement, NotificationBellProps>(...)
// packages/ui/src/components/notification-bell.tsx:10-20

export type NotificationKind =
  | "registration" | "wrangler" | "role" | "questionnaire"
  | "supplier" | "security" | "bulletin";
export const NOTIFICATION_KIND_ICON: Record<NotificationKind, LucideIcon>;
export interface NotificationItemProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  kind: NotificationKind;
  title: React.ReactNode;
  body?: React.ReactNode;
  meta?: React.ReactNode;
  timeAgo?: string;
  source?: string;
  read?: boolean;      // default false
  blocking?: boolean;  // default false
}
export function NotificationItem(props: NotificationItemProps): JSX.Element;
// packages/ui/src/components/notification-item.tsx:26-83

export function readRate(read: number, of: number): ReadRate;   // packages/ui/src/lib/bulletin.ts:19
```

### `@quagga/core` — `notifications.ts`
```ts
export type RegistrationDecision =
  Extract<RegistrationStatus, "approved" | "changes_requested" | "rejected">;   // :34-37

export function registrationDecisionNotification(input: {
  campName: string; decision: RegistrationDecision;
  campSlug?: string | null; reason?: string | null;
}): NotificationPayload;                                                        // :52-57

export function questionnaireReleasedNotification(input: {
  title: string; blocking: boolean; activationId?: string | null; from?: string;
}): NotificationPayload;                                                        // :91-96

export function officerAssignmentRequestNotification(input: {
  officerLabel: string; campName: string; campSlug?: string | null;
}): NotificationPayload;                                                        // :109-113

export function officerAcceptedNotification(input: {
  officerLabel: string; campName: string; campSlug?: string | null;
}): NotificationPayload;                                                        // :123-127

export function wranglerAssignedNotification(input: {
  wranglerName: string; campName: string; campSlug?: string | null;
}): NotificationPayload;                                                        // :138-142

export function supplierStandingNotification(input: { standingLabel: string }): NotificationPayload;   // :152
export function supplierStepConfirmedNotification(input: { stepLabel: string }): NotificationPayload;  // :164
export function supplierStepReopenedNotification(input: { stepLabel: string }): NotificationPayload;   // :183
export function bulletinNotification(input: {
  bulletinTitle: string; bulletinId: string;
}): NotificationPayload;                                                        // :201-204

export type NotificationOrigin = "org" | "camp" | "system";                     // :220
export type NotificationApp = "web" | "org" | "suppliers";                      // :230
export interface NotificationRow extends NotificationPayload {
  userId: string;
  bulletinId?: string | null;
  origin?: NotificationOrigin | null;
  linkApp?: NotificationApp | null;
}                                                                               // :233-239

export function resolveNotificationLinkApp(
  linkApp: NotificationApp | null | undefined, writingApp: NotificationApp,
): NotificationApp | null;                                                      // :259-262
export function notificationLinkIsLocal(
  linkApp: string | null | undefined, thisApp: NotificationApp,
): boolean;                                                                     // :274-277
export function resolveBulletinAudience(spec: AudienceSpec, ctx: AudienceContext): string[];  // :286-289
export function buildBulletinNotifications(
  input: { bulletinId: string; title: string }, userIds: readonly string[],
): NotificationRow[];                                                           // :297-300
export function shouldSendImmediateEmail(
  kind: NotificationKind, opts?: { blocking?: boolean },
): boolean;                                                                     // :320-323
export function notificationMentionsAny(
  payload: NotificationPayload, needles: readonly string[],
): boolean;                                                                     // :337-340
export function isUnread(n: { readAt: Date | null }): boolean;                  // :357
export function countUnread(notifications: readonly { readAt: Date | null }[]): number;  // :362-364
export interface DayGroup<T> { key: string; label: string; items: T[] }          // :370-376
export function groupNotificationsByDay<T extends { createdAt: Date }>(
  items: readonly T[], now: Date = new Date(),
): DayGroup<T>[];                                                               // :390-393
```

### `@quagga/core` — `security-notifications.ts`
```ts
export const ACCOUNT_SECURITY_PATH = "/account/security";                       // :27
export const ACCOUNT_PATH = "/account";                                         // :28
export interface SecurityEmail { kind: SecurityEventKind; subject: string; text: string }  // :145-150
export function maskEmail(email: string): string;                               // :161
export function securityMessageLeaks(
  message: SecurityEmail | NotificationPayload,
  forbidden: readonly (string | null | undefined)[],
): boolean;                                                                     // :324-327
// + 9 notification builders and 9 email builders (see §3 capabilities 86-87)
```

### apps/web
```ts
// components/notifications/format.ts
export function relativeTime(at: Date, now: Date = new Date()): string;         // :19
export function sourceLabel(kind: NotificationKind, origin?: string | null): string | null;  // :71-74
export function dayGroupHeading(label: string): string;                         // :85
export const BLOCKING_MARKER = "REQUIRED, blocks registration";                 // :105
export function isBlockingNotification(input: { kind: NotificationKind; title: string }): boolean;  // :108-111
export interface NotificationRowItem {
  id: string; kind: NotificationKind; title: string;
  body: string | null; meta: string | null; link: string | null;
  read: boolean; blocking: boolean;
}                                                                               // :120-131
export function toRowItem(view: {...; origin?: string | null}, now = new Date()): NotificationRowItem;  // :138-157

// components/notifications/filter-tabs.tsx
export function notificationsHref(filter: NotificationFilter): string;          // :25
export function NotificationFilterTabs(props: { filter: NotificationFilter; unreadCount: number }): JSX.Element;  // :31-37

// components/notifications/notification-panel.tsx
export function NotificationPanel({ count = 0 }: { count?: number }): JSX.Element;  // :34

// components/notifications/notification-row.tsx
export function NotificationRow(props: {
  item: NotificationRowItem; className?: string; onOpen?: () => void;
}): JSX.Element;                                                                // :16-25

// components/notifications/mark-all-read-button.tsx
export function MarkAllReadButton(props: {
  unreadCount: number; className?: string; onDone?: () => void;
}): JSX.Element;                                                                // :14-23

// components/notifications/notification-day-groups.tsx
export function NotificationDayGroups({ groups }: { groups: DayGroup<NotificationRowItem>[] }): JSX.Element;  // :9-13

// components/header-notification-bell.tsx
export function HeaderNotificationBell({ count }: { count?: number }): JSX.Element;  // :13

// lib/notifications.ts
export async function getUnreadNotificationCount(): Promise<number>;            // :28
export interface NotificationView {
  id: string; kind: NotificationKind; title: string; body: string | null;
  link: string | null; bulletinId: string | null; createdAt: Date; readAt: Date | null;
}                                                                               // :45-54
export async function listNotificationGroups(
  filter: NotificationFilter = "all",
): Promise<DayGroup<NotificationView>[]>;                                       // :60-62
export async function recentNotifications(limit = 6): Promise<NotificationView[]>;  // :97-99
export async function insertNotifications(
  handle: Database, rows: readonly NotificationRow[],
): Promise<void>;                                                               // :134-137

// lib/notifications-actions.ts
export type NotificationActionResult = { ok: true } | { ok: false; error: string };  // :15-16
export async function markNotificationRead(
  raw: z.input<typeof MarkReadInput>,   // { notificationId: string }  (z.string().uuid())
): Promise<NotificationActionResult>;                                           // :18, :21-23
export async function markAllNotificationsRead(): Promise<NotificationActionResult>;  // :54

// app/(app)/notifications/actions.ts
export async function fetchRecentNotifications(): Promise<NotificationRowItem[]>;  // :15-17
```

### apps/org (divergent signatures worth noting)
```ts
export function timeAgo(value: Date, now: Date = new Date()): string;              // relative-time.ts:11
export const NOTIFICATION_SOURCE_LABELS: Record<NotificationKind, string>;         // relative-time.ts:33
export interface NotificationRowProps {
  id: string; kind: NotificationKind; title: string; body: string | null;
  link: string | null; timeAgo: string; source: string; read: boolean;
  onOpen?: () => void;
}                                                                                  // notification-row.tsx:14-25
export function MarkAllReadButton(props: {
  disabled?: boolean; className?: string; onDone?: () => void;
}): JSX.Element;                                                                   // mark-all-read-button.tsx:12-21
export async function getUnreadNotificationCount(userId?: string): Promise<number>;// lib/notifications.ts:27
export async function listNotificationGroups(
  userId: string, filter: NotificationFilter = "all",
): Promise<DayGroup<NotificationView>[]>;                                          // lib/notifications.ts:78-81
export async function recentNotifications(userId: string, limit = 6): Promise<NotificationView[]>;  // :97-100
export async function fetchRecentNotifications(): Promise<Omit<NotificationRowProps, "onOpen">[]>;  // actions/notifications.ts:22-24
```

### apps/suppliers (divergent)
```ts
export const PORTAL_SOURCE = "AfrikaBurn";                                         // format.ts:41
export interface NotificationRowItem {   // NOTE: no `blocking` field
  id: string; kind: NotificationKind; title: string; body: string | null;
  meta: string;               // NOTE: non-nullable here, nullable in web
  link: string | null; read: boolean;
}                                                                                  // format.ts:63-73
export async function getUnreadNotificationCount(userId: string): Promise<number>; // lib/notifications.ts:23
export interface SupplierBulletin { id: string; title: string; bodyMd: string; pinned: boolean; publishedAt: Date | null }  // :141-147
export async function getBulletinForSupplier(userId: string, bulletinId: string): Promise<SupplierBulletin | null>;  // :161-164
```

---

## 6. UX behaviours

**Bell.** Sits in the right cluster of every app's header, between the nav links and sign-out
(`apps/web/components/app-shell.tsx:97`, `apps/org/components/console-header.tsx:130`,
`apps/suppliers/components/portal-header.tsx:68`). All three headers carry the same comment
explaining the badge count is **awaited, not streamed behind Suspense**, because a streamed
boundary "permanently claims 'none unread'" for a JS-off reader
(`console-header.tsx:127-129`, `portal-header.tsx:65-67`; the fuller version of the argument is
`app-shell.tsx:28-38`).

**Panel.** Bell click opens a Radix Popover card anchored under the bell, `align="end"`,
8px offset, max 26rem wide and 60vh tall. Header row = `Notifications` + `Mark all read`.
Body = `Loading…` → empty sentence → 6 rows. Footer = `All notifications →`. Clicking any row
navigates and closes the panel; mark-all-read toasts, refreshes the route, and bumps the panel's
nonce so it re-fetches.

**Inbox page.** Eyebrow (`Your inbox`, `text-[11px] font-bold uppercase tracking-[0.18em]
text-primary`) → `h1 text-3xl font-extrabold` → blurb → a flex-wrap toolbar with the filter tabs
on the left and Mark-all-read on the right → either an `EmptyState` or the day groups. Column is
`max-w-3xl`, vertical rhythm `gap-7` (`apps/web/app/(app)/notifications/page.tsx:87-115`).

**Day groups.** Each group is a `<section>` with an `h2` heading in
`text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground` over a
`rounded-xl border border-border bg-card/40` list with `divide-y divide-border/60`
(`notification-day-groups.tsx:15-27`). Page rows use `px-4 py-3.5`; panel rows use `px-3 py-3`.

**Row.** Icon circle (`h-9 w-9 rounded-full`, `bg-muted`, or `bg-destructive/15` when blocking)
→ title → optional body → optional `Required · blocks registration` line → meta line
→ unread dot. Read rows drop to `opacity-70`.

**Reading semantics.** Read is **per-row on open**, not on page view. This is the single
biggest UX difference from Camp 404, whose page marks the entire snapshot read on load
(`camp-404/apps/web/app/notifications/page.tsx:28-32`).

**Empty states.** Filter-specific and warm, never an error (`EmptyState` is dashed-border,
centred, `py-16`). Panel empty copy differs per app:
- web: *"Nothing here yet — camp events and AfrikaBurn bulletins will land in this panel."*
- org: *"Nothing here yet — registration decisions, officer acceptances and org bulletins will land in this panel."*
- suppliers: *"You're all caught up — step confirmations, standing changes and depot bulletins will land in this panel."*

**Loading.** Every inbox has a `loading.tsx` that renders `SkeletonRegion` (which carries
`aria-busy="true" aria-live="polite" data-loading="true"` — an E2E-assertable hook,
`packages/ui/src/components/skeleton.tsx:47-60`) with **two** day groups of **three** rows each.

---

## 7. Validation + edge-case rules (digit-exact)

1. Badge hides at `count <= 0`; `Math.floor` applied; cap default **99**, rendered `"99+"`
   (`notification-bell.tsx:21-22`).
2. `NotificationBell` `count` default **0**; `max` default **99** (`:20`).
3. Inbox list hard cap **`.limit(200)`** rows per filter — no pagination exists
   (`apps/web/lib/notifications.ts:77`, `apps/org/lib/notifications.ts:92`,
   `apps/suppliers/lib/notifications.ts:82`).
4. Panel limit **6** (`apps/web/app/(app)/notifications/actions.ts:18`).
5. `NOTIFICATION_INSERT_CHUNK = 1000` — verified by test: **exactly 1 insert at 1000 rows,
   exactly 2 at 1001 (1000 + 1)** (`apps/web/lib/__tests__/notifications-inbox.test.ts:84-98`),
   and **3 inserts totalling 2500 for a 2500-row fan-out (1000+1000+500)**
   (`apps/org/lib/__tests__/console-notifications.test.ts:236-249`).
6. **Contradictory comments in all three copies** (real, reproduced verbatim): the const's doc
   says *"Eight bound columns each, so Postgres' 65535-parameter ceiling lands at 8191 rows"*
   (`apps/web/lib/notifications.ts:124-125`) while the loop comment ten lines below says
   *"Six bound parameters per row … dies at 10923 rows with SQLSTATE 08P01"* (`:139-143`).
   The insert actually binds **8** columns (`:147-159`). The audit flags both as
   "wrong-in-different-ways statements, triplicated" (`docs/simplification-audit.md:119`).
   **Do not copy either number without recomputing.**
7. `markNotificationRead` input is `z.object({ notificationId: z.string().uuid() })` — a
   non-uuid is **refused and writes nothing** (`notifications-actions.ts:18`; test at
   `notifications-inbox.test.ts:288-292`).
8. Every mutation WHERE pins `user_id` to the session user **and** `isNull(readAt)`, so a
   forged id from another account matches zero rows (`notifications-actions.ts:30-36, :61-65`).
9. `?filter=` parsing never throws — `safeParse(...) ? data : "all"` in web
   (`page.tsx:69-70`); `.catch("all").parse(raw ?? "all")` in org/suppliers.
10. `relativeTime` thresholds: `MINUTE = 60_000`, `HOUR = 60 * MINUTE`, `DAY = 24 * HOUR`;
    boundaries are strict `<` so exactly 60000 ms reads `"1 minute ago"`, not `"Just now"`
    (`format.ts:11-33`).
11. Web's `relativeTime` has **no `"Yesterday"` branch** — day 1 falls through to the weekday
    short name. Suppliers' copy adds `if (delta < 2 * DAY) return "Yesterday";` at
    `apps/suppliers/components/notifications/format.ts:30`. Org's `timeAgo` returns
    `"Yesterday"` at `days === 1` and `"N days ago"` for `days < 30`
    (`apps/org/components/notifications/relative-time.ts:23-24`). **Three behaviours, one
    concept.**
12. Locales are hardcoded and differ: web + suppliers use `"en-GB"`, org's fallback uses
    `"en-ZA"` (`format.ts:31,33,92`; `relative-time.ts:25`).
13. `dayGroupHeading` regex is anchored `^(\d{4})-(\d{2})-(\d{2})$` and constructs
    `new Date(Number(y), Number(m) - 1, Number(d))` — **local time, not UTC parsing**, which
    is consistent with `dayKey`'s local getters (`format.ts:86-89`, `core/notifications.ts:378-383`).
14. Blocking detection is a **substring match on the title** for `"REQUIRED, blocks
    registration"`, gated to `kind === "questionnaire"` (`format.ts:105-114`). The builder that
    writes it: `` `New questionnaire from ${from}: ${input.title} — REQUIRED, blocks registration` ``
    (`core/notifications.ts:101`). Note the row displays `"Required · blocks registration"` —
    **display copy and wire marker are different strings** (`notification-item.tsx:128`).
15. `questionnaireReleasedNotification` `from` default: `input.from?.trim() || "AfrikaBurn"`
    (`core/notifications.ts:97`).
16. `registrationDecisionNotification` body fallback: `approved` → `reason` (may be null);
    `changes_requested` → `reason ?? "Open your registration to see what to update."`;
    `rejected` → `reason` (`core/notifications.ts:60-82`). `reason` is normalised
    `input.reason?.trim() || null` (`:59`).
17. `resolveNotificationLinkApp`: `linkApp === undefined ? writingApp : linkApp` — strictly
    `undefined`, **not** `??`. The comment records that `??` caused a real production bug
    (`core/notifications.ts:250-263`).
18. `notificationLinkIsLocal(null | undefined | "")` → `true` (pre-migration rows count as
    local) (`core/notifications.ts:278`).
19. `getUnreadNotificationCount` returns `row?.count ?? 0` — a missing count row is 0, not
    `undefined` (`apps/web/lib/notifications.ts:41`; test at `notifications-inbox.test.ts:167-174`).
20. Every read short-circuits **before any DB call** when `!isDatabaseConfigured()` or signed
    out, asserted by `expect(dbMock.queries).toHaveLength(0)`
    (`notifications-inbox.test.ts:152-165`).
21. `toRowItem` meta assembly: `[relativeTime(...), source].filter(Boolean).join(" · ")`, then
    `meta || null` — so a row with no source shows the time alone, and an empty meta is null
    (`format.ts:159-168`).
22. `insertNotifications` is a no-op returning `undefined` for an empty batch, asserted to
    issue **zero** queries (`notifications-inbox.test.ts:79-82`).
23. Bulletin compose limits: title `.max(200)`, body `.max(20000)` (`types/notifications.ts:48-49`).
24. `readRate(read, of)` clamps: `total = Math.max(0, Math.floor(of))`,
    `opened = Math.min(Math.max(0, Math.floor(read)), total)`, `percent = total === 0 ? 0 :
    Math.round((opened/total)*100)` — `readRate(50, 30)` → `{read:30, of:30, percent:100}`
    (`packages/ui/src/lib/bulletin.ts:19-23`; test `tier2-3.test.tsx:59-70`).
25. Bulletin readability is **enforced by the notification row's existence**: no
    `notifications` row for `(userId, bulletinId)` → `null` and the bulletin is never even
    queried (`apps/web/lib/bulletins.ts:32-43`, asserted at
    `notifications-inbox.test.ts:196-204` including `expect(dbMock.queries).toHaveLength(1)`).
26. An unpublished bulletin the user *did* receive still returns `null`
    (`bulletins.ts:56`; test `:206-221`).
27. `getPinnedBulletinsForCurrentUser` filters `publishedAt !== null` **after** the query,
    in JS (`bulletins.ts:92`; test `:236-257`).

---

## 8. Test coverage

**`packages/core/src/__tests__/notifications.test.ts` (373 lines)** — the contract document.
- Bulletin audience: `resolveBulletinAudience(spec, ctx)` is asserted `toEqual(resolveAudience(spec, ctx))` — the "one resolver, two consumers" claim is a test, not a comment (`:82-91`).
- Fan-out: one row per recipient, all with `kind:"bulletin"`, `bulletinId`, `link:"/bulletins/b-1"` (`:93-112`); an empty audience fans out to `[]` and that is **valid, not an error** (`:114-123`).
- Org-internal isolation: an `org_internal` bulletin resolves to exactly `["god","orgMember","staff"].sort()` and to none of the camp users (`:128-137`).
- **Privacy**: five planted hard-locked values — `"+27821234567"`, `"9001015800081"`, `"A12345678"`, `"Ma Emergency"`, `"penicillin allergy"` — run through **eleven** builder outputs, all asserted clean, plus a **non-vacuity test** proving the guard catches a genuine leak and a blank-needle test (`:141-227`).
- Blocking flag: `/REQUIRED/` present when blocking, absent when not (`:231-246`).
- `shouldSendImmediateEmail`: true for registration; true for questionnaire only with `{blocking:true}`; false for `bulletin`, `role`, `supplier`, `security`, `wrangler` (`:250-274`).
- `countUnread`: 2 of 3 rows; 0 for empty and all-read (`:278-292`).
- `groupNotificationsByDay`: labels `["Today","Yesterday","2027-02-28"]` with newest-first order preserved inside each group (`:296-318`).
- `notificationLinkIsLocal` / `resolveNotificationLinkApp`: 4 + 4 cases including the end-to-end "a bulletin's null survives all the way to the reader's inbox" (`:322-373`).

**`apps/web/lib/__tests__/notifications-inbox.test.ts` (325 lines)** — the chunk boundary at 1000/1001; explicit-null vs absent `linkApp`; foreign-link nulling proved **separately for both reads** because "two copies of a rule is how this file's own linkApp bug happened" (`:144-150`); env-less/signed-out zero-query proof; missing count row; per-filter query narrowing; the five bulletin authorisation cases; own-rows-only scoping; uuid refusal; `unstable_rethrow` proof using a real `NEXT_REDIRECT` digest object (`:302-314`); and `revalidated.map(r => r.path)` asserted `["/notifications", "/"]` (`:285`).

**`apps/org/lib/__tests__/console-notifications.test.ts` (316 lines)** — same contract against a `fakeDb`, plus the 2500-row chunking assertion and `toMatchObject({body:null, link:null, origin:null, bulletinId:null, linkApp:"org"})` proving optional columns are **defaulted, not omitted from the INSERT** (`:189-208`).

**`apps/suppliers/lib/__tests__/notifications.test.ts` (293)** + **`notification-actions.test.ts` (198)** — the third copy.

**`packages/ui` tests** —
- `tier2-3.test.tsx:25-57`: the icon map is exhaustive (`Object.keys(...).sort()` equals the kind list), every icon is **distinct** (`new Set(icons).size === icons.length`), the derived meta line renders as `"2 hours ago · AfrikaBurn"`, the blocking line matches `/blocks registration/i`, and `getByLabelText("Unread")` is present unread / null when read.
- `form-controls.test.tsx:90-107`: the bell's two aria labels and the `"99+"` cap.

**E2E (`e2e/`)** — real browsers, real deploys, no DB back doors:
- `e2e/specs/org-staff/bulletins-audience-reach.spec.ts:100-113` — a targeted artist sees the bulletin **and its body after clicking**; a camp lead and a bystander see it on neither `/notifications` nor `/notifications?filter=bulletins` ("a leak that only shows under a filter is still a leak").
- `:143-152` — the cross-app hop: published on :3001, read on :3002, absent for burners.
- `e2e/specs/officer/officer-assignment-request-and-consent.spec.ts:41-71` — the officer request row and then the acceptance row appear in the inbox.
- `e2e/specs/org-staff/wrangler-assignment.spec.ts:114-146` — wrangler rows reach the right inboxes and no bystander's.
- `e2e/specs/anon/gated-web-surfaces-refused.spec.ts:35` — `/notifications` is refused anonymously.
- `e2e/specs/supplier/isolation.spec.ts:38-39` — an org-internal supplier note must leave `/notifications` clean.

**Gaps I verified.** There is **no unit test at all** for `apps/web/components/notifications/format.ts`, `apps/org/.../relative-time.ts` or `apps/suppliers/.../format.ts` — I grepped every test file for these module paths and found none. So `relativeTime`, `sourceLabel`, `dayGroupHeading`, `isBlockingNotification` and `toRowItem` — the entire display-formatting layer, including the substring-based blocking detection — are covered only indirectly through `NotificationItem`'s render tests. There are also no component tests for `NotificationPanel`, `NotificationRow` (any app), `MarkAllReadButton` or `NotificationFilterTabs`.

---

## 9. Dependency footprint

| Dependency | Where | Camp 404 status |
|---|---|---|
| `lucide-react` icons: `Bell`, `Megaphone`, `PartyPopper`, `Compass`, `UserCheck`, `ClipboardList`, `Package`, `ShieldAlert`, `ArrowRight`, `CheckCheck`, `Inbox`, `BellOff`, `Pin`, `X` | bell, item, panel, buttons, pages | **Present** — all confirmed to exist in the target's installed `lucide-react@1.16.0` per the mechanical-delta pass |
| `@radix-ui/react-popover` | `packages/ui/src/components/popover.tsx` | **Present** — Camp 404 has `popover.tsx` |
| `@radix-ui/react-tabs ^1.1.14` | `packages/ui/src/components/tabs.tsx` | **ABSENT** — must be installed, or the tabs re-expressed on Camp 404's `segmented-control` |
| `zod ^4.4.3` | `NotificationFilter`, `MarkReadInput` | Present, same range |
| `drizzle-orm` `and/desc/eq/isNull/sql/inArray` | all three `lib/notifications.ts` | Present, same version |
| `next/navigation` `useRouter`, `unstable_rethrow` | rows, buttons, actions | Present (Next 16 both sides) |
| `next/cache` `revalidatePath` | actions | Present |
| `next/link` | panel footer, filter tabs | Present |
| `@quagga/ui` `toast` | mark-all-read | **API-identical** to Camp 404's — `ToastOptions {description?, duration?}`, `toast.success/error(title, opts)` (donor `toast.tsx:14-18` vs `camp-404/packages/ui/src/components/toast.tsx:21-25`). Drop-in. |
| `@quagga/ui` `Button` (`variant="ghost" size="sm"`) | mark-all-read | Present, variants character-identical per the delta pass |
| `@quagga/ui` `EmptyState` | all inbox pages | Present, **but donor's takes `action?: React.ReactNode` and Camp 404's takes `children`** — the inbox pages only pass `icon/title/description`, which both support, so this is a non-issue for unit 05 |
| `@quagga/ui` `Skeleton` / `SkeletonRegion` | all three `loading.tsx` | **ABSENT** in Camp 404 (no `skeleton.tsx`). Would come with WP7 (#131) anyway |
| `@quagga/ui` `Card`/`CardContent`, `Badge` | org page, bulletin card | Present |
| `@quagga/types` `NotificationKind`, `NotificationFilter` | everywhere | Would be new modules in `@camp404/types` |
| `@quagga/core` `DayGroup`, `groupNotificationsByDay`, `notificationLinkIsLocal`, `resolveNotificationLinkApp`, `NotificationRow` | libs | `@camp404/core` is pure + zero-I/O, exactly the right home |
| `server-only` | all three `lib/notifications.ts` | **Camp 404's `apps/web/vitest.config.ts` has no `server-only` alias stub** — donor apps all do. Any ported server module carrying `import "server-only"` needs that seam added before it can be unit-tested |
| `@quagga/core/audience` `resolveAudience` + `AudienceContext` | bulletin fan-out only | **Org/tenant-coupled — do not port** (see §10) |

No new runtime packages are required for the bell / row / panel / grouping / mark-all-read
core. **`@radix-ui/react-tabs` is the only genuinely new dependency**, and only for the filter
tabs.

---

## 10. AfrikaBurn / multi-tenant coupling

### Clean — no coupling at all
- `packages/ui/src/components/notification-bell.tsx` — zero domain imports.
- `packages/ui/src/components/notification-item.tsx` — imports only React, lucide, `cn`. Confirms the delta pass's finding that `packages/ui` is tenant-agnostic (a grep for `groupId|orgId|tenant|MembershipRole` across all of donor `packages/ui/src` returns zero hits).
- `groupNotificationsByDay`, `DayGroup`, `dayKey`, `isUnread`, `countUnread`, `readRate` — pure, generic.
- `NotificationFilter` (`all|unread|bulletins`) — the only AB-flavoured member is `bulletins`, which maps 1:1 onto a Camp 404 `broadcast_kind` of `announcement`.
- The `notifications` **table itself** carries no `group_id` and no `edition_id`. This is unusual for the donor and makes the inbox one of its most portable subsystems.

### Kind enum — AB-shaped vocabulary, not AB-shaped structure
`["registration","wrangler","role","questionnaire","supplier","security","bulletin"]`
(`schema.ts:229-238`). `registration`, `wrangler` and `supplier` are AfrikaBurn nouns with no
Camp 404 analogue. The **structure** (a kind enum driving an exhaustive icon map, mirrored
across Zod + pgEnum + a TS union with a "keep the three in sync" comment) is exactly what Camp
404 wants; the **members** must be re-expressed. Camp 404's nearest existing vocabularies are
`broadcast_kind` `[announcement, team_message, lead_directive, reminder, system]`
(`camp-404/packages/db/src/schema.ts:156`) and `broadcast_presentation`
`[acknowledge, popup, feed]` (`:194`) — and it already has a 3-glyph presentation map at
`camp-404/apps/web/app/notifications/presentation-meta.ts:9-15`.

### `link_app` — pure three-app artefact, delete it
`NotificationApp = "web" | "org" | "suppliers"`, `resolveNotificationLinkApp`,
`notificationLinkIsLocal`, the `link_app` column, and the `notificationLinkIsLocal(r.linkApp,
"<slug>")` projection in every read exist **only** because one table is read by three
deployments. Camp 404 is one app on one domain. **All of it collapses to `link: r.link`.**
Roughly 40 lines of core + 3 test blocks + 1 column + 6 projection sites disappear.

### `origin` — keep the idea, shrink the enum
`NotificationOrigin = "org" | "camp" | "system"` (`core/notifications.ts:220`) answers "who
sent this". Camp 404 has no org/camp fork, but it **does** have a sender: `listInbox` already
left-joins `users.displayName` as `senderName`
(`camp-404/packages/db/src/broadcasts.ts:479, :486`). So the useful residue is
`system` vs `a named member`, which Camp 404 already models better than the donor does. The
donor's whole `sourceLabel` / `ALWAYS_ORG_SOURCED` apparatus (`format.ts:44-78`) is a
workaround for **not** having a sender name on the row — Camp 404 should skip it and print
`senderName`. The *lesson* is still worth stealing verbatim: the row must not claim an
attribution it cannot prove.

### Bulletins — audience machinery is tenant-coupled, the read-side rule is not
`resolveBulletinAudience` → `resolveAudience(spec, ctx)` where `AudienceContext` carries
`groups`, `memberships` (with the `god|org_staff|lead|admin|member|engineer` role enum),
`registrations` and `bios` keyed by `editionId`
(`packages/core/src/__tests__/notifications.test.ts:39-77` shows the full shape).
**Do not port.** Camp 404 already has its own `resolveAudience`
(`camp-404/packages/db/src/broadcasts.ts:52`) over `broadcast_scope`
`[everyone, team, team_leads, drivers, individual]`.

What **is** portable from the bulletin half is the read-side authorisation rule, which has no
tenancy in it at all: *a broadcast body is readable iff a delivery row ties it to this user*
(`apps/web/lib/bulletins.ts:32-43`). That is a one-query pattern Camp 404 can apply to
`notification_deliveries` directly.

### `edition_id`
`bulletins.edition_id` is NOT NULL and cascades from `editions` (`schema.ts:1751-1753`).
Camp 404 has no editions table. If any bulletin schema is lifted, this column is dropped —
but Camp 404 already has `broadcasts` and does not need `bulletins`.

### Org / participant / supplier split
This unit is the **clearest case in the whole donor of the split producing pure waste**:
three near-identical panels (110/105/106 lines), three near-identical `lib/notifications.ts`
(163/149/193), three near-identical mark-all-read buttons (55/49/56), three
`header-notification-bell.tsx` pass-throughs (15/13/14), and three formatting modules with
three different time ladders. The donor's own audit puts ~200 removable lines on the panel
alone (`docs/simplification-audit.md:894-910`) and names `lib/notifications.ts` as
"written three times" (`:106-127`). **Camp 404 needs exactly one of each** — harvest web's
copy, which is the most complete (it is the only one with `blocking`, the only one with a
`sourceLabel` fallback, and one of two with the success toast).

### Verified drift between the forks (copy the *right* one)
| Behaviour | web | org | suppliers |
|---|---|---|---|
| Mark-all-read success toast | ✅ `:38-42` | ❌ **missing** `:33-42` | ✅ `:38-44` |
| Optimistic read on row open | ✅ `:28-31` | ❌ none | ✅ `:30-33` |
| Blocking flag on the row | ✅ | ❌ | ❌ (no `blocking` field in its `NotificationRowItem`) |
| Radix Tabs filter | ✅ | ❌ pill nav | ✅ (byte-identical to web) |
| `dayGroupHeading` | ✅ `:85` | ❌ absent | ✅ `:48` (byte-identical) |
| `body` via `NotificationItem`'s own prop | ✅ | ❌ stuffed into `meta` | ❌ stuffed into `meta` |
| `"Yesterday"` in relative time | ❌ | ✅ | ✅ |
| Native `<button>` row (a11y) | ✅ | ❌ `role="button"` div + hand-rolled keydown | ✅ |

---

## 11. Verbatim excerpts of the most valuable pieces

### 11.1 `NotificationItem` — the whole row, one file, zero coupling
`packages/ui/src/components/notification-item.tsx:26-44, :72-143`

```tsx
export type NotificationKind =
  | "registration"
  | "wrangler"
  | "role"
  | "questionnaire"
  | "supplier"
  | "security"
  | "bulletin";

/** kind → leading glyph. Exhaustive over NotificationKind by construction. */
export const NOTIFICATION_KIND_ICON: Record<NotificationKind, LucideIcon> = {
  registration: PartyPopper, // 🎉 status changes (approved/under review/…)
  wrangler: Compass, // 🧭 wrangler assigned
  role: UserCheck, // 🧑‍🚒 role/officer assignment + acceptance
  questionnaire: ClipboardList, // 📋 questionnaire released (blocking → flagged)
  supplier: Package, // 📦 supplier onboarding confirmations
  security: ShieldAlert, // account security events
  bulletin: Megaphone, // 📣 org broadcast
};

export function NotificationItem({
  kind, title, body, meta, timeAgo, source,
  read = false, blocking = false, className, ...props
}: NotificationItemProps) {
  const Icon = NOTIFICATION_KIND_ICON[kind];
  const metaLine =
    meta ?? ([timeAgo, source].filter(Boolean).join(" · ") || null);
  const isBlocking = blocking && kind === "questionnaire";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-3 text-left transition-colors",
        read ? "opacity-70" : undefined,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isBlocking
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <p
          className={cn(
            "text-sm leading-snug",
            read
              ? "font-normal text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          {title}
        </p>
        {body ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {body}
          </p>
        ) : null}
        {isBlocking ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
            Required · blocks registration
          </p>
        ) : null}
        {metaLine ? (
          <p className="text-xs text-muted-foreground">{metaLine}</p>
        ) : null}
      </div>

      {read ? null : (
        <span
          aria-label="Unread"
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
        />
      )}
    </div>
  );
}
```

Every token used (`bg-muted`, `text-muted-foreground`, `bg-destructive/15`, `text-destructive`,
`bg-primary`, `text-foreground`) exists in Camp 404's `@theme`. This compiles unchanged.

### 11.2 `groupNotificationsByDay` — the whole grouping algorithm
`packages/core/src/notifications.ts:370-411`

```ts
export interface DayGroup<T> {
  /** Stable day key, YYYY-MM-DD in the caller's locale-neutral terms. */
  key: string;
  /** Human label: "Today", "Yesterday", else the date key. */
  label: string;
  items: T[];
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Group already-sorted (newest-first) items by calendar day, labelling the
 * two most recent days "Today"/"Yesterday". Pure — `now` is injectable for
 * deterministic tests.
 */
export function groupNotificationsByDay<T extends { createdAt: Date }>(
  items: readonly T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const todayKey = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);

  const groups: DayGroup<T>[] = [];
  let current: DayGroup<T> | null = null;
  for (const item of items) {
    const key = dayKey(item.createdAt);
    if (!current || current.key !== key) {
      const label: string =
        key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : key;
      current = { key, label, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}
```

This is exactly the "use the platform `Date` with a UTC/local round trip, not hand-rolled
math and not a new package" shape Camp 404's memory records as the house rule. It belongs in
`@camp404/core` verbatim (rename to `groupByDay` — nothing about it is notification-specific).

### 11.3 The panel's lazy-load-on-open + refetch nonce
`apps/web/components/notifications/notification-panel.tsx:34-72`

```tsx
export function NotificationPanel({ count = 0 }: { count?: number }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationRowItem[] | null>(null);
  // Bumped to force a refetch (e.g. after "Mark all read").
  const [nonce, setNonce] = React.useState(0);
  const headingId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchRecentNotifications().then((rows) => {
      if (!cancelled) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, nonce]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <NotificationBell count={count} />
      </PopoverTrigger>
      <PopoverContent
        className={PANEL_CLASS}
        align="end"
        sideOffset={8}
        aria-labelledby={headingId}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 id={headingId} className="text-sm font-semibold">
            Notifications
          </h2>
          <MarkAllReadButton
            unreadCount={count}
            className="-mr-2"
            onDone={() => setNonce((n) => n + 1)}
          />
        </div>
```

with `const PANEL_CLASS = ["flex w-[min(26rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden p-0"].join(" ")`
(`:30-32`). The comment at `:20-24` is the reusable design decision:

> This is a NON-MODAL surface, so it uses @quagga/ui's Popover primitive (Radix
> Popover) rather than Dialog. Popover renders no page overlay — the page behind
> stays undimmed and interactive — while still giving real focus management and
> Escape / outside-click dismissal.

### 11.4 The interactive row — optimistic read + inert short-circuit
`apps/web/components/notifications/notification-row.tsx:26-66`

```tsx
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // Optimistic: the dot clears the moment you open the row. Derived (not
  // seeded) state so a server refresh — e.g. after "Mark all read" — still wins.
  const [opened, setOpened] = React.useState(false);
  const read = item.read || opened;

  const row = (
    <NotificationItem
      kind={item.kind} title={item.title} body={item.body} meta={item.meta}
      read={read} blocking={item.blocking} className={className}
    />
  );

  // Nothing to do: already read and nowhere to go → a plain, inert row.
  if (read && !item.link) return row;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setOpened(true);
        onOpen?.();
        startTransition(async () => {
          if (!item.read)
            await markNotificationRead({ notificationId: item.id });
          if (item.link) router.push(item.link);
          else router.refresh();
        });
      }}
      className="block w-full rounded-lg text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
    >
      {row}
    </button>
  );
```

Three ideas worth keeping: (a) `read = item.read || opened` is **derived**, so a server
refresh still wins; (b) an inert row does not get a `<button>` wrapper at all — the affordance
matches the capability, which is the donor's stated house rule ("nothing in this product may
claim something that isn't true", `CONTRIBUTING.md:62-71`); (c) the whole row is one native
`<button>`, not a `role="button"` div.

### 11.5 URL-as-state filter tabs
`apps/web/components/notifications/filter-tabs.tsx:10-58`

```tsx
// The All / Unread · n / Bulletins segmented control (canvas `X6YN3` toolbar).
// State lives in the URL (`?filter=`) so the list stays a server render and a
// filtered inbox is linkable/back-button-friendly — each trigger is therefore a
// <Link> (Radix `asChild`), not a client tab handler. The empty TabsContent
// panels exist so every trigger's aria-controls resolves.

const TAB_ORDER: readonly NotificationFilter[] = ["all", "unread", "bulletins"];
const TAB_LABEL: Record<NotificationFilter, string> = {
  all: "All", unread: "Unread", bulletins: "Bulletins",
};

/** `/notifications` for the default tab, `?filter=x` otherwise. */
export function notificationsHref(filter: NotificationFilter): string {
  return filter === "all" ? "/notifications" : `/notifications?filter=${filter}`;
}

export function NotificationFilterTabs({ filter, unreadCount }: {
  filter: NotificationFilter; unreadCount: number;
}) {
  return (
    <Tabs value={filter}>
      <TabsList>
        {TAB_ORDER.map((tab) => (
          <TabsTrigger key={tab} value={tab} asChild>
            <Link href={notificationsHref(tab)} scroll={false}>
              {TAB_LABEL[tab]}
              {tab === "unread" && unreadCount > 0 ? (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  · {unreadCount}
                </span>
              ) : null}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
      {TAB_ORDER.map((tab) => (
        <TabsContent key={tab} value={tab} className="m-0" />
      ))}
    </Tabs>
  );
}
```

Note `scroll={false}` on every link — switching filters must not jump the page. Camp 404's
`typedRoutes: true` means `/notifications?filter=unread` needs the route to exist (it does).

### 11.6 The chunked fan-out insert
`apps/web/lib/notifications.ts:124-162` — the hard-won bit, and the one with lying comments

```ts
/** Rows per INSERT. Eight bound columns each, so Postgres' 65535-parameter
 * ceiling lands at 8191 rows — 1000 keeps a wide margin. */
const NOTIFICATION_INSERT_CHUNK = 1000;

export async function insertNotifications(
  handle: Database,
  rows: readonly NotificationRow[],
): Promise<void> {
  if (rows.length === 0) return;
  // CHUNKED. Six bound parameters per row against Postgres' 65535-parameter
  // ceiling means a single insert dies at 10923 rows with SQLSTATE 08P01 —
  // and because a bulletin publish wraps this in a transaction, the whole
  // broadcast rolled back. AfrikaBurn is comfortably bigger than 10922 people,
  // so this was a live ceiling on the participant fan-out, not a theoretical one.
  for (let i = 0; i < rows.length; i += NOTIFICATION_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + NOTIFICATION_INSERT_CHUNK);
    await handle.insert(schema.notifications).values(
      chunk.map((r) => ({
        userId: r.userId,
        kind: r.kind,
        title: r.title,
        body: r.body ?? null,
        link: r.link ?? null,
        origin: r.origin ?? null,
        linkApp: resolveNotificationLinkApp(r.linkApp, "web"),
        bulletinId: r.bulletinId ?? null,
      })),
    );
  }
}
```

The **pattern** is worth taking (chunk a fan-out; accept an explicit handle; no-op on empty;
default optional columns rather than omitting them). The **numbers in the comments are
mutually contradictory and both wrong** — see §7 rule 6. Camp 404's `publishAnnouncement`
(`camp-404/packages/db/src/broadcasts.ts:228`) fans out inline at publish and would hit the
same ceiling; at 30–80 users it will not, but the guard costs 3 lines.

---

## 12. Notes, risks and things not to copy

- **`apps/web/app/api/notifications/digest/route.ts` is a self-declared stub.** It returns
  `{ok:true, job:"notifications.digest", status:"stub", scheduled:false, message:"…"}` and
  sends no mail (`:27-35`). The email-digest half of the spec (`docs/notifications-spec.md:48-51`,
  "Resend digest for unread (max 1/day)") is **not built**. Camp 404's own
  `/api/cron/notifications/reminders` is likewise a `{ok:true, sent:0}` stub, so there is
  nothing to harvest here beyond `shouldSendImmediateEmail`'s gating rule.
- **`origin` is written but never read by the UI.** All three `NotificationView` interfaces omit
  `origin` (`apps/web/lib/notifications.ts:45-54`, org `:50-59`, suppliers `:40-49`), and the
  `toRowItem` doc comment admits it: *"OPTIONAL because the reads that feed this … do not
  project the column into their `NotificationView` yet"* (`format.ts:146-153`). So
  `sourceLabel` always takes its kind-allow-list fallback in production today. Writers do
  populate it (`apps/web/lib/questionnaire-store.ts:281` `origin:"camp"`,
  `apps/org/lib/actions/bulletins.ts:284` `origin:"org"`,
  `packages/db/src/deletion.ts:180` `origin:"system"`). **Live latent gap — do not assume the
  origin path is exercised.**
- **Blocking state is inferred from a title substring.** `isBlockingNotification` matching
  `"REQUIRED, blocks registration"` (`format.ts:105-114`) is fragile by construction and the
  file says so ("this phrase IS the wire format — keep the two in sync"). Camp 404 already has
  a proper column for this shape (`broadcast_presentation`), so **model it, don't grep it**.
- **`NOTIFICATION_KINDS` is gone.** `docs/simplification-audit.md:839` lists it as a dead export
  at `packages/types/src/notifications.ts:28`; I verified it no longer exists (the 12-finding
  dead-code batch was applied). Line numbers in that audit for this file are therefore stale.
- **Copy web's fork, not org's or suppliers'.** See the drift table in §10.
- **`packages/ui` has no `NotificationPanel`.** The audit calls it "the one piece of this
  feature that escaped the shared package" (`docs/simplification-audit.md:892`). Camp 404
  should put it in `@camp404/ui` from the start, taking `items`, `count`, an
  `onLoad: () => Promise<Item[]>` server-action prop and the empty copy as props — which is
  exactly the donor's own proposed fix (`:908`).
- **`AGENTS.md:96-106` in Camp 404 forbids genericising.** The panel-as-props extraction is
  fine (one component, one consumer), but do not build a generic "inbox engine" — Camp 404
  wants one bespoke `NotificationPanel` for one app.
- **Formatting drift on paste.** Donor files are uniformly semicolon'd; several Camp 404
  `packages/ui` components are written without semicolons despite `.prettierrc.json`
  `"semi": true`. Run `pnpm format` after any lift.
- **Motion.** None of these components carry `prefers-reduced-motion` handling, and the donor's
  `packages/ui` has no `tw-animate-css`, so its Popover has no animate-in/out classes. Camp 404
  imports `tw-animate-css` and WP8 (#132) is specifically about reduced-motion — add both when
  porting.
