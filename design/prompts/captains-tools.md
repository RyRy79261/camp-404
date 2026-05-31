# Pencil prompt — captains-tools

Reproduce `design/reference/19-captains-tools.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The captain-only tool hub — the "Camp Tools" index on the captain control layer. It lists captain-clearance tooling as tappable cards; right now there is a single entry (Announcements & notifications), so most of the screen is empty page background below it.

## Layout (top → bottom)

- A ghost back button at top-left: a small left chevron `<` followed by the label "Captains".
- Page header below it: a large bold `h1` "Camp tools".
- A muted sub-line directly under the title: "Captain-only tooling for running the camp."
- A single tool card (the only list item). The card is a horizontal row:
  - Left: a small square icon tile (rounded, bordered, faintly lighter inner fill) holding an outlined megaphone icon.
  - Middle (flex-1): a bold card title "Announcements & notifications" (wraps to two lines), then a muted multi-line description below it.
  - Right: a single right-chevron `>` affordance in muted colour, vertically centred.
- Everything else is empty page background — no tab bar, no footer.

## Copy & components

- Back button: "Captains" (lucide `ChevronLeft`). Component: `Button` (`@camp404/ui/components/button`), `variant="ghost"`, `size="sm"`.
- Heading: "Camp tools" (`h1`, `text-2xl font-semibold`).
- Sub-line: "Captain-only tooling for running the camp." (`text-sm text-muted-foreground`).
- Tool card uses `Card` / `CardHeader` / `CardTitle` / `CardDescription` (`@camp404/ui/components/card`).
  - `CardTitle` (`text-base`): "Announcements & notifications"
  - `CardDescription`: "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry."
  - Icon: lucide `Megaphone` (`h-5 w-5`); trailing lucide `ChevronRight` (`h-5 w-5`).
- Container: `<main>` `mx-auto max-w-2xl px-6 py-10`. List is a `<ul>` with `space-y-3`; each card has `rounded-xl` and a `hover:bg-accent/30` hover tint.

## Tokens

Subset this screen actually uses (from `design/brief.md`):

- Page base: `var(--color-background)` — `oklch(0.15 0.05 295)` (hex mirror `#0d061e`).
- Primary text (title, sub-line): `var(--color-foreground)` — `oklch(0.97 0.02 330)` (hex mirror `#f7ecf3`).
- Card surface: `var(--color-card)` — `oklch(0.26 0.08 295)` (one step lighter than background; reads as elevated).
- Card text: `var(--color-card-foreground)` — `oklch(0.97 0.02 330)`.
- Muted text (sub-line, description, back label, right chevron): `var(--color-muted-foreground)` — `oklch(0.7 0.05 325)`.
- Recessed icon-tile fill: `var(--color-muted)` at ~40% (`bg-muted/40`) — `oklch(0.22 0.06 295)`.
- Borders (card edge, icon tile): `var(--color-border)` — `oklch(0.35 0.1 305)`.
- Hover tint: `var(--color-accent)` at 30% — `oklch(0.62 0.18 255)`.
- Focus ring: `var(--color-ring)` (= primary) — `oklch(0.65 0.27 340)`.
- Radius: `--radius` 0.625rem (10px); card is `rounded-xl`, icon tile `rounded-md`.

## Do NOT

- Do not invent iOS / phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Do not redesign the layout, restyle the card, or add tools that aren't there.
- Do not use a light theme — dark midnight-violet only.
- Do not guess hex values outside the tokens above.

## Notes

- Single-card screen by design: the large empty lower two-thirds of background is correct, not a crop error.
- The card is one full-width row; the description is long and wraps to ~7 lines, pushing the card tall — match that height rather than truncating.
- The icon tile and card border are the same brighter-violet border token, but the tile is visibly lighter inside (muted fill) than the card around it.
- No primary-magenta is present on this screen at rest; magenta only appears as the focus ring when the card is keyboard-focused, and the accent-blue only as a subtle hover tint. Render the default (unfocused, unhovered) state.
- Type tokens are unspecified in the design system — use a neutral geometric sans for all text here (no monospace on this screen).
