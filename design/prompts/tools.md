# Pencil prompt — tools

Reproduce `design/reference/08-tools.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The member tools index — an uncategorised toolbox of camp utilities (invite, forms, family tree) that haven't yet been grouped into a dedicated quadrant. Each entry is a tappable row that navigates to its tool.

## Layout (top → bottom)

- Generous top padding; single column, left-aligned, full-width content block within `max-w-lg`.
- Page header: large bold `h1` "Tools", with a two-line muted subtitle directly beneath it.
- A vertical stack of three card rows, evenly spaced (~12px gap between cards).
- Each card row is identical in structure: a square icon tile on the left, a title + description block in the middle (flex-1), and a right-pointing chevron on the far right, all vertically centred.
- Cards fill the column width; below the third card the page is empty (no footer, no tab bar).

## Copy & components

Header:
- `h1`: **Tools**
- subtitle (muted): "Uncategorised tooling for camp members. We'll move tools into dedicated quadrants as we group them."

Three tool rows (icon · title · description), top to bottom:
1. Mail icon — **Invite a member** — "Mint a single-use code to bring someone onto Camp 404."
2. Clipboard-list icon — **My forms** — "Revisit a questionnaire you've already completed, update your answers, and see what changed."
3. Git-branch icon — **Family tree** — "See who brought who onto camp."

Each row ends with a right ChevronRight, muted-foreground.

Components (`@camp404/ui`): each row is a `Card` (rounded-xl, `bg-card`, 1px `border`, subtle shadow) wrapping a `CardHeader` laid out as a horizontal flex (icon, text, chevron). Inside: `CardTitle` (title, ~base size, semibold, foreground) and `CardDescription` (muted-foreground). The icon tile is a 40×40 (`h-10 w-10`) square with `rounded-md`, a `border`, and a `bg-muted/40` fill. Icons are lucide-react: `Mail`, `ClipboardList`, `GitBranch`, `ChevronRight`. Whole card is a `Link` (hover tint `hover:bg-accent/30`, focus ring = `--color-ring`).

## Tokens

- `--color-background` — `oklch(0.15 0.05 295)` / `#0d061e` — page base.
- `--color-foreground` — `oklch(0.97 0.02 330)` / `#f7ecf3` — "Tools" title + card titles.
- `--color-muted-foreground` — `oklch(0.7 0.05 325)` — subtitle, descriptions, chevron.
- `--color-card` — `oklch(0.26 0.08 295)` — card surface (one step lighter than page = elevated).
- `--color-card-foreground` — `oklch(0.97 0.02 330)` — text on card.
- `--color-muted` — `oklch(0.22 0.06 295)` — icon tile fill (at ~40% opacity).
- `--color-border` — `oklch(0.35 0.1 305)` — card + icon-tile borders (brighter violet edge).
- `--color-accent` — `oklch(0.62 0.18 255)` — hover tint on a card (at ~30% opacity).
- `--color-ring` — `oklch(0.65 0.27 340)` — focus ring (= magenta primary).

Radius: cards `rounded-xl` (~12px), icon tiles `rounded-md` (~6px).

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Do not redesign the layout, reorder the rows, or restyle the cards.
- Do not use a light theme — dark midnight-violet only.
- Do not add a search bar, headings, badges, or grouping that aren't in the screenshot.

## Notes

- This is the default resting state: three plain, fully-enabled rows. No locked/disabled tiers, no status pills, no glitch effect on this screen.
- Cards must read as clearly elevated above the near-black page — the `card` (0.26) vs `background` (0.15) lightness gap is the whole visual hierarchy here; keep it subtle but visible.
- Icon glyphs are thin-stroke, muted/foreground-tinted (not magenta) and sit centred in their tiles.
- The card titles are noticeably smaller than the page `h1` (`text-base` vs `text-2xl`); keep that contrast.
- Cards are left-aligned and span the column; content below the last card is empty background — do not centre the stack vertically.
