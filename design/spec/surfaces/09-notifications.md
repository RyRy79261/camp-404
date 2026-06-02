# Notifications inbox — functional brief

- **Route:** `/notifications`
- **Canonical board:** `21-s12-notifications` (S12 Notifications, 430px mobile-only board)
- **Superseded / dropped:** nothing — this surface has a single board; no iterations exist.
- **Breakpoints:** 430px (mobile-first, single column). No desktop variant drawn; the board drives the mobile layout exclusively. The live code applies `max-w-2xl px-6 py-10` — see Divergences.

---

## Purpose

The notifications inbox is the member-facing chronological list of every notification delivered to the signed-in camp member. It is reached via the header bell on the home surface (`HomeHeader`) and is a **read-only review surface**: opening it snapshots the current delivery set, marks that exact snapshot read (clearing the header bell badge), displays each delivery with a presentation-derived icon, title, optional "New" pill, sender attribution, acknowledgement status, body text, and relative/date timestamp. It is the only surface that shows inbox history; it is **not** the acknowledge gate (unit 25) or the broadcast compose / fan-out engine (unit 27).

---

## Layout & modules

The surface is a single-column scroll at 430px with three stacked regions:

### 1. DetailHeader
Reusable `DetailHeader` component at the top. Contains a 40×40 rounded back-button (chevron-left icon, `$muted` fill) and a title text label. On this board the title override reads "Home", linking back to `/`. The board shows `overrides: ["Home"]` on the `DetailHeader` instance — the back destination is `/`.

### 2. Header block
Below DetailHeader: a vertical block (`gap:6`, `pad:[12,16,8,16]`).
- `h1` "Notifications" — Inter 22px/700, `$foreground`.
- Subtitle paragraph "Everything that's been sent your way." — Inter 13px/normal, `$muted-foreground`.

### 3. Notification list (populated state)
Vertical list (`gap:12`, `pad:[8,16,20,16]`). One row per `InboxItem`, newest-first (`createdAt DESC`). Each row is a horizontal card with a fixed 40×40 icon circle on the left, and a text column on the right.

**Row anatomy (all three presentation types share this layout):**

| Zone | Content |
|---|---|
| Icon circle | 40×40, `r:999`, `fill:$muted`; presentation icon centred (`$foreground`, lucide) |
| Top row left | Title text (Inter 14px/600 `$foreground`) + optional "New" pill |
| Top row right | Relative time string (Inter 12px/normal `$muted-foreground`) |
| Body row | Body text (Inter 13px/normal `$muted-foreground`, `whitespace-pre-wrap`) |
| Attribution row | "From {senderName} · {ack status}" (Inter 12px/normal `$muted-foreground`); omitted when `senderName` is null |

**Per-presentation icon mapping:**
| Presentation | Lucide icon | Board row |
|---|---|---|
| `acknowledge` | `Megaphone` | Row 1 — unread (primary accent border/bg + "New" pill) |
| `popup` | `MessageSquare` | Row 2 — read (plain card border) |
| `feed` | `Bell` | Row 3 — read (plain card border), no attribution |

**Unread row styling (board Row 1):** `fill:#ff008c14`, `stroke:$primary`. In code: `border-[color:var(--color-primary)]/40 bg-accent/20`.

**Read row styling (board Rows 2 & 3):** `fill:$card`, `stroke:$border`.

### 4. Empty state
When `items.length === 0`: centred vertical stack (`pad:[40,24]`).
- 64×64 circle (`r:999`, `fill:$muted`) with `bell-off` icon (`$muted-foreground`).
- Text "No notifications yet." — Inter 15px/600, `$foreground`.

---

## Components used

| Name | Kind | Role | Key props / variants |
|---|---|---|---|
| `DetailHeader` | Reusable (canvas component) | Back navigation chrome at the top of the screen | title override = "Home"; back action → `/` |
| `HomeHeader` (entry) | Existing app component | Header bell + unread badge that links to this surface | `notifications` prop (int); badge hidden at 0, capped "99+" at >99 |
| `NotificationRow` | New (inline `<li>`, no extracted component in live code) | Single delivery row; two CSS variants (unread / read) | `isNew: boolean`, `presentation`, `senderName`, `acknowledgedAt` |
| `presentationIcon()` | New (pure helper, already exists in live code) | Maps `broadcast_presentation` → lucide icon JSX | `acknowledge`→Megaphone, `popup`→MessageSquare, `feed`/fallback→Bell |

No shadcn primitives are introduced beyond what the existing codebase already uses (no new `@camp404/ui` imports required by this surface alone).

---

## States

### Global matrix

| State | Trigger | Treatment |
|---|---|---|
| **Empty** | `items.length === 0` | 64px bell-off icon circle + "No notifications yet." centred text; no list rendered |
| **Loading** | Page awaiting `listInbox` + `markRead` server-side | RSC `force-dynamic`; no client spinner/skeleton — HTML is not returned until both calls resolve |
| **Populated** | `items.length > 0` | Full notification list, newest-first; see row variants below |
| **Validation-error** | — | N/A — read-only surface, no forms or inputs |
| **Submitting / pending** | `markRead` side effect | Server-side, fire-before-render; no in-page indicator |
| **Success** | Inbox rendered | Implicit — cleared badge on return to home is the success signal; no toast |
| **Disabled** | — | N/A — no actionable controls to disable (only the back-navigation link is present) |

### Gating states

| Gate | Trigger | Treatment |
|---|---|---|
| **Unauthenticated** | No active session | `getAuthenticatedUserOrRedirect()` → redirect to auth |
| **Invite-gated** | `!hasCampAccess(campUser, email)` | `redirect("/signup/required")`; passes if `isGodEmail` OR non-null `inviteCode` |
| **Onboarding-incomplete / pending-approval / rejected** | User in those states but past invite gate | NOT enforced on this page (asymmetry vs home spine); such users see their inbox |
| **Captain-only-locked** | — | N/A — inbox is member-facing; every rank sees their own deliveries; no rank gate |

### Row-level variants

| Variant | Condition | Visual treatment |
|---|---|---|
| **Unread-on-arrival** | `readAt === null` at snapshot time (`isNew = true`) | `fill:#ff008c14` / `stroke:$primary`; "New" pill (Inter 10px/700, `$primary` bg, `$primary-foreground` text) |
| **Already-read** | `readAt` was set before this page load | `fill:$card` / `stroke:$border`; no pill |

### Acknowledgement-status variants (attribution line)

| Variant | Condition | Suffix |
|---|---|---|
| Acknowledged | `acknowledgedAt` is set (any presentation) | "· acknowledged" |
| Awaiting acknowledgement | `presentation === 'acknowledge'` AND `acknowledgedAt` is null | "· awaiting acknowledgement" |
| No suffix | `presentation === 'feed'` or `'popup'` and not acked | _(empty — just "From {name}")_ |
| Attribution suppressed | `senderName` is null (system delivery, deleted sender) | Entire attribution line omitted, including any ack status hint |

---

## User actions

| Action | Result |
|---|---|
| Tap header bell on home | `HomeHeader` link navigates to `/notifications`; server fetches + marks snapshot read |
| Page load / open inbox | `listInbox` snapshot rendered; `markRead` stamps `readAt` on all unread rows in snapshot; bell badge clears on return to home |
| Tap "Home" back button (DetailHeader) | Navigate to `/`; no data mutation |
| Visually read a row | No interaction; rows are static `<li>` elements — no expand, no dismiss, no deep-link, no per-row mark-read/unread |
| Return to home | `countUnread` now reflects cleared rows; badge drops accordingly |

**Not on this surface:** acknowledging an `acknowledge` delivery (that is unit 25, the full-screen `AcknowledgementGate`). Opening the inbox never stamps `acknowledgedAt`.

---

## Data & enums

### Tables touched

| Table | Access | Fields read | Fields written |
|---|---|---|---|
| `notification_deliveries` | Read + write | `id`, `userId`, `broadcastId`, `title`, `body`, `presentation`, `readAt`, `acknowledgedAt`, `createdAt` | `readAt` (stamped by `markRead` where `IS NULL`) |
| `broadcasts` | Read (LEFT JOIN) | `id`, `senderId` (to resolve sender) | — |
| `users` | Read (LEFT JOIN via broadcasts) | `displayName` (→ `senderName`) | — |
| `users` (auth gate) | Read | `id`, `inviteCode`, `primaryEmail` (via `hasCampAccess`) | — |

Fields present on `notification_deliveries` but NOT read by this surface: `channel`, `pushStatus`, `refType`, `refId`, `deliveredAt`.

### Enums used

| Enum | Values | Usage |
|---|---|---|
| `broadcast_presentation` (`schema.ts:166`) | `acknowledge` \| `popup` \| `feed` | Drives icon mapping, ack-status suffix; default `feed` |
| `notification_channel` (`schema.ts:144`) | `push` \| `in_app` \| `both` | Stored on delivery; not displayed |
| `push_delivery_status` (`schema.ts:150`) | `queued` \| `sent` \| `failed` \| `skipped` | Stored on delivery; not displayed |
| `broadcast_kind` (`schema.ts:128`) | `announcement` \| `team_message` \| `lead_directive` \| `reminder` \| `system` | Broadcast-side; not surfaced in inbox |
| `broadcast_scope` (`schema.ts:136`) | `everyone` \| `team` \| `team_leads` \| `drivers` \| `individual` | Broadcast-side; not surfaced in inbox |

### InboxItem interface (from `broadcasts.ts:460-469`)

```
{ id: string; title: string; body: string; presentation: AnnouncementPresentation;
  senderName: string | null; readAt: Date | null; acknowledgedAt: Date | null; createdAt: Date }
```

Note: `channel`, `refType`, `refId`, `pushStatus`, `broadcastId` are intentionally omitted — the inbox UI cannot deep-link.

### New schema

None. This surface introduces no new tables, columns, or enums. The only schema addition in the redesign is `captain_promotion_requests` + `promotion_request_status` (Decision 4), which is unrelated.

---

## Validation & edge cases

- **Read ≠ acknowledge.** `markRead` stamps `readAt` only. `acknowledgedAt` is exclusively set by the acknowledge gate (unit 25). An `acknowledge`-presentation delivery continues to show "· awaiting acknowledgement" in the inbox attribution line until the user clears the full-screen gate.
- **Snapshot consistency.** `markRead` receives exactly the ids from the just-fetched `listInbox` snapshot. A delivery arriving between snapshot and write stays unread (not displayed, not stamped) — correct by design.
- **`markRead` is idempotent and owner-scoped.** The UPDATE is guarded by `readAt IS NULL` and `userId` match. Already-read rows are never re-stamped; another user's rows are never touched. Empty id list is a no-op.
- **`isNew` is point-in-time.** The "New" pill reflects `readAt === null` at snapshot time. The same rows show as read on the next load. First-open-marks-read: the pill and the read state are set in the same server render.
- **Sender fallback chain.** `senderName` is null when: (a) `broadcastId` is null (system notification); (b) `broadcasts.senderId` is null (sender deleted, `onDelete: set null`); (c) `users.displayName` is unset. A null `senderName` suppresses the entire attribution line — including the "· awaiting acknowledgement" hint for `acknowledge` deliveries. This is a known edge case: a system-generated `acknowledge` delivery would show no ack status.
- **Ack-status suffix precedence.** `acknowledgedAt` set wins over `presentation` value — shows "· acknowledged" even if the delivery is somehow `popup` or `feed` with an `acknowledgedAt` (schema allows it). Only an unacknowledged `acknowledge`-presentation delivery shows "· awaiting acknowledgement".
- **Body is plain text.** `whitespace-pre-wrap`, no markdown, no HTML, no truncation.
- **Date-only display.** `toLocaleDateString()` — locale-dependent, no time component. Two deliveries on the same day are indistinguishable by the visible timestamp; ordering still uses full `createdAt DESC`.
- **No pagination.** `listInbox` returns all user deliveries with no LIMIT/offset. For long-lived accounts this list grows unboundedly. Every render re-calls `markRead` with all ids (harmless — `IS NULL` guard prevents re-stamping). Pagination is not in scope for this surface.
- **Gate asymmetry.** Onboarding-incomplete, pending-approval, and rejected users who have passed the invite gate are NOT blocked from the inbox (unlike home). This is observable behaviour in the live code — intentional, since notifications should remain accessible regardless of onboarding state.
- **Badge cap.** Unread counts above 99 render as the string "99+" in `HomeHeader`.

---

## Flows

```
HomeHeader bell (any page)
  └── tap bell → navigate /notifications
        └── RSC render:
              1. Auth gate (redirect if unauthenticated)
              2. Invite gate (redirect /signup/required if no camp access)
              3. listInbox(userId) → snapshot
              4. markRead(userId, snapshot ids) → stamps readAt
              5. Render: DetailHeader + Header Block + List (or Empty)
                    ├── populated → notification rows (newest-first)
                    │     ├── isNew rows → primary accent + "New" pill
                    │     └── read rows → plain card style
                    └── empty → bell-off empty state

  Tap DetailHeader "Home" back button
        └── navigate / (home)
              └── home re-computes countUnread → badge cleared/reduced
```

---

## Divergences from feature-set reference

| Feature-set signal | Board / Decision | Resolution |
|---|---|---|
| The reference contract documents a `max-w-2xl px-6 py-10` container, wider than the product-wide `max-w-lg` shell used on other surfaces | Board is 430px (single-column mobile); no desktop variant drawn | Board wins: spec the 430px single-column layout. The `max-w-2xl` in live code is flagged as a layout drift to reconcile during build — the board implies the standard 430px column, not a wider tablet shell. |
| Reference contract mentions `<a href="/">` ghost Button with `ChevronLeft` as the back control | Board uses the `DetailHeader` reusable component (which contains the 40×40 rounded back button + title) | Board wins: use `DetailHeader`, not a bespoke inline ghost Button. The DetailHeader component is already drawn and indexed. |
| Reference mentions "New" pill as `bg-primary / text-primary-foreground text-[10px]` | Board shows `▸ "New Pill" {pad:[2,8] ai:center r:999 fill:$primary}` with `T "New" [Inter/10px/700/$primary-foreground]` | Consistent — no divergence on content, minor token naming difference only. |
| Reference marks the empty state as a `<p>` "No notifications yet." | Board shows a 64px `bell-off` icon circle + text "No notifications yet." (richer empty state) | Board wins: include the icon circle + text composition, not a plain paragraph. |
| Reference date display uses `toLocaleDateString()` (date-only). Board shows relative strings ("Just now", "2d ago", "3d ago") | Board uses relative timestamps; live code uses `toLocaleDateString()` | Board wins on presentation intent: relative timestamps ("Just now", "2d ago") are the intended UX. Live code uses date-only — flag as a build reconciliation. Use a relative-time formatter (e.g. `date-fns/formatDistanceToNow` or equivalent) rather than `toLocaleDateString()`. |

---

## Open questions / build reconciliations

1. **Relative vs absolute timestamps.** The board shows "Just now", "2d ago", "3d ago". Live code uses `toLocaleDateString()` (date only). Confirm relative-time formatting is the target; if so, add a dependency (e.g. `date-fns formatDistanceToNow`) and match the board's intent.
2. **`max-w-2xl` layout drift.** Live code uses `max-w-2xl px-6 py-10` on the notifications page, wider than the product `max-w-lg` shell. The board is 430px. Reconcile to standard shell width during build unless a wider notifications view is a deliberate product decision.
3. **System `acknowledge` delivery with null `senderName`.** An `acknowledge`-presentation notification generated by the system (no `broadcastId` / null `senderId`) suppresses the entire attribution line, including the "· awaiting acknowledgement" hint. The user has no inline prompt to complete the acknowledgement. Confirm whether system-generated `acknowledge` deliveries are a real scenario; if so, consider a fallback attribution line ("· awaiting acknowledgement" without a "From" prefix).
4. **Pagination / list length.** `listInbox` returns all deliveries with no LIMIT. For members with a long camp history this page could become very long. No scroll position is preserved. Confirm whether a hard cap (e.g. last 50) or virtual scroll is wanted, or leave unbounded.
5. **`refType` / `refId` deep-link.** The `notification_deliveries` schema carries `refType` and `refId` for deep-linking, but the `InboxItem` interface omits them and the inbox renders no per-row tap action. Confirm whether row taps (navigating to the referenced surface) are deferred or permanently out of scope for the inbox.
6. **Gate asymmetry (onboarding / pending / rejected).** Users who have a redeemed invite code but have not completed onboarding or whose approval is pending/rejected can currently reach the inbox. This is intentional in live code but may be worth a product decision: should pending/rejected users see notifications at all, or should those states redirect here too?
