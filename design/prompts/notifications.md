# Pencil prompt — notifications

Reproduce `design/reference/13-notifications.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The member-facing notification inbox behind the header bell — every notification delivered to the signed-in member, newest first. The reference shows the empty state; opening the inbox also clears the unread badge.

## Layout (top → bottom)

- Ghost "back" button at top-left: a left chevron icon followed by the word **Home** (muted, no border or fill).
- Page heading **Notifications** — large, bold, foreground-coloured.
- Sub-line directly under it: **Everything that's been sent your way.** — small, muted text.
- A gap, then a single line of muted body text: **No notifications yet.** (this is the empty state shown in the reference).
- The rest of the screen is empty midnight-violet background. No tab bar, no FAB, no chrome.

## Copy & components

- Back link: `Button` (`@camp404/ui`, variant `ghost`, size `sm`) wrapping `<a href="/">`, with a `ChevronLeft` (lucide) icon + text `Home`.
- `<h1>` — `Notifications` (text-2xl, font-semibold).
- `<p>` muted — `Everything that's been sent your way.`
- Empty state `<p>` muted — `No notifications yet.`
- Seeded-list state (not in reference, see Notes): a `<ul>` of bordered list rows (no Card component — plain `rounded-lg border p-4` rows). Each row: a presentation icon (`Megaphone` for acknowledge, `MessageSquare` for popup, else `Bell`), a `<h2>` title, an optional pink **New** pill, a right-aligned date `<time>`, a wrapped body `<p>`, and an optional `From {senderName}` line that may append ` · acknowledged` or ` · awaiting acknowledgement`.

## Tokens

- Page base: `var(--color-background)` — `oklch(0.15 0.05 295)` / `#0d061e`.
- Heading + titles: `var(--color-foreground)` — `oklch(0.97 0.02 330)` / `#f7ecf3`.
- Sub-line, empty-state text, dates, body, "From" line: `var(--color-muted-foreground)` — `oklch(0.7 0.05 325)`.
- Unread row tint (seeded state): `bg-accent/20` over `var(--color-accent)` — `oklch(0.62 0.18 255)` — with a `var(--color-primary)`/40 border — `oklch(0.65 0.27 340)` / magenta `rgba(255,0,140,0.92)`.
- "New" pill: fill `var(--color-primary)`, text `var(--color-primary-foreground)` — `oklch(0.99 0.005 340)`.
- Read-row border: `var(--color-border)` — `oklch(0.35 0.1 305)`.

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Do not redesign the layout or add cards/avatars to the empty state.
- Do not use a light theme — dark midnight-violet only.

## Notes

- The reference PNG is the **empty state**. The source also supports a **seeded list state** — render the empty state as the primary mock to match the screenshot, and optionally a second frame showing 2–3 list rows.
- Multi-state row variants: unread rows get a faint magenta border + electric-blue `/20` tint; read rows are border-only. Unread rows carry a small pink **New** pill next to the title.
- Off the reference but in the data: `acknowledge`-type rows show a `Megaphone` icon and a ` · awaiting acknowledgement` / ` · acknowledged` suffix on the "From" line; `popup` rows use `MessageSquare`; default rows use `Bell`.
- Generous left/right padding (px-6) and vertical rhythm (py-10); single column, content left-aligned. No font tokens are defined — use the default sans.
