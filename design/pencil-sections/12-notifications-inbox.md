### 12. Notifications inbox
**Purpose:** A read-only, member-facing list of every notification delivered to the signed-in camp member, newest-first, that marks the displayed snapshot read on open.
**Layout & elements:** Mobile single column (container `max-w-2xl`). Top→bottom: back-to-home ghost button — `ChevronLeft` icon + "Home" (links to `/`); `<h1>` "Notifications"; subtitle "Everything that's been sent your way."; then either the empty paragraph "No notifications yet." or a `<ul>` of static `<li>` rows. Each row: presentation icon (`Megaphone`/`MessageSquare`/`Bell`), title, optional "New" pill, date (`<time>`), body (whitespace-preserved plain text), and an optional "From {senderName}" line with an ack-status suffix.
**Every action (preserve all):**
- Open inbox (via header bell → `/notifications`): renders the list AND marks the whole snapshot read; no per-row "mark read" button.
- Tap "Home" ghost button → navigate to `/` (only navigational control).
- Read a row: view-only — NO delete, archive, mute, dismiss, mark-unread, expand/collapse, or deep-link/open controls.
- Implicit badge clear: bell badge drops on return home as snapshot rows become read.
- Opening NEVER acknowledges (no `acknowledgedAt` stamped here — that is unit 25's gate).
**States to design:**
- Empty: zero deliveries → "No notifications yet.", no bell badge.
- Loading: server-rendered, no spinner/skeleton.
- Populated: rows in two CSS variants — unread-on-arrival (`isNew`, emphasised border/bg + "New" pill) vs already-read (plain).
- Validation-error / submitting / disabled: N/A (no form, no actionable controls).
- Success: implicit — rendered list with badge cleared.
- Invite-gated: fails `hasCampAccess` → redirect `/signup/required`.
- Onboarding-incomplete / pending / rejected: NOT gated here (asymmetry vs home).
- Per-row ack-status: "· acknowledged", "· awaiting acknowledgement", or none.
**Options & exact values:** `broadcast_presentation` `["acknowledge", "popup", "feed"]` (default `"feed"`) — read by inbox; icons: `acknowledge`→Megaphone, `popup`→MessageSquare, `feed`(fallback)→Bell. Carried on the delivery row but NOT displayed by the inbox: `notification_channel` `["push", "in_app", "both"]` (default `"both"`); `broadcast_kind` `["announcement", "team_message", "lead_directive", "reminder", "system"]`; `broadcast_scope` `["everyone", "team", "team_leads", "drivers", "individual"]`; `push_delivery_status` `["queued", "sent", "failed", "skipped"]` (default `"queued"`). Ack suffixes: " · acknowledged", " · awaiting acknowledgement". Pill text "New". Badge cap: counts >99 render "99+". Date: `toLocaleDateString()` (date only). Bell aria-label: "Notifications ({n} unread)" or "Notifications".
**Validation & rules:**
- Read ≠ acknowledge: only `readAt` stamped on open.
- Snapshot consistency: marks exactly the displayed ids read; later arrivals stay unread.
- `markRead` idempotent, owner-scoped, only stamps still-unread rows; empty-list no-op.
- `isNew` is point-in-time (snapshot `readAt === null`); read on reload.
- NULL `senderName` (system/deleted sender) suppresses the whole attribution+ack line.
- Body is plain text, no markdown/HTML, no truncation.
- No pagination/limit — all deliveries rendered, list unbounded.
**Do-not-drop:** Snapshot-then-mark-read semantics with point-in-time "New" flagging and the read-vs-acknowledge distinction (inbox never acknowledges). No dead/orphaned/404 variants in this unit.
