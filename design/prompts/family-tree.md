# Pencil prompt — family-tree

Reproduce `design/reference/14-family-tree.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

> HEADS-UP (read the Notes): the committed `14-family-tree.png` actually captures the route's **error boundary** ("Something went sideways."), not the populated tree. This prompt describes the real family-tree screen from source (`app/family-tree/page.tsx`, `app/family-tree/family-tree.tsx`). Recapture the screenshot once the tree renders.

## What this screen is

A captain-facing referral graph — "Who brought who onto Camp 404." It renders the invite/referral roster as a collapsible indented tree where every branch below a root is one invite-code redemption.

## Layout (top → bottom)

- Single dark column, generous side padding, top-aligned content.
- Ghost back button, top-left: a left chevron + "Tools".
- Header block: H1 "Family tree" (semibold), then a muted helper paragraph.
- Control row (one line, gap): a search Input with a left-aligned search icon, then two small outline buttons "Expand all" and "Collapse".
- The tree: a vertical list of Cards. Each row = a disclosure chevron (▸ collapsed / ▾ expanded; leaf rows show a small dot) + a Card.
- Each Card: a small round user-icon avatar, the member's display name (medium weight), optional UPPERCASE pill ("Captain" amber, "You" magenta), an optional "via `CODE`" mono subline, and a right-aligned descendant-count pill when the node has children.
- Nested children are indented (20px per depth) and joined to their parent by thin CSS guide lines (a vertical rule with an elbow into each row).
- Empty state: a single centered Card reading "No matches." (when searching) or "No accounts yet."

## Copy & components

Headings / copy (verbatim from source):
- H1: "Family tree"
- Helper: "Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption."
- Back button: "Tools"
- Search placeholder: "Search by name or invite code…"
- Buttons: "Expand all", "Collapse"
- Pills: "Captain", "You"; subline prefix "via" + mono code
- Empty states: "No matches." / "No accounts yet."

Components (`@camp404/ui`): `Button` (variant `ghost` for back, `outline size="sm"` for Expand/Collapse), `Input` (search), `Card` + `CardContent` (each node and the empty state). Icons (lucide): ChevronLeft, ChevronDown, ChevronRight, Search, User.

## Tokens

Use only what this screen touches. Reference as `var(--color-*)`; never invent hex.

- `--color-background` `oklch(0.15 0.05 295)` — page base (`#0d061e`)
- `--color-foreground` `oklch(0.97 0.02 330)` — text (`#f7ecf3`)
- `--color-muted` `oklch(0.22 0.06 295)` — avatar / count-pill fill
- `--color-muted-foreground` `oklch(0.7 0.05 325)` — helper text, chevrons, "via" subline
- `--color-card` `oklch(0.26 0.08 295)` — node cards (elevated, one step lighter than page)
- `--color-card-foreground` `oklch(0.97 0.02 330)` — text on cards
- `--color-border` `oklch(0.35 0.1 305)` — card borders, tree guide lines, input border
- `--color-primary` `oklch(0.65 0.27 340)` — hot magenta; the "You" pill + the `ring-1` highlight on the viewer's own card (`#ff008c`-class)
- `--color-ring` `oklch(0.65 0.27 340)` — focus ring (= primary)

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no bottom tab bar, no device frame.
- Do not redesign the tree (keep the indented-list-of-cards pattern; do not switch to an org-chart/canvas graph).
- Do not use a light theme. Dark midnight-violet only.

## Notes

- THE REFERENCE PNG IS WRONG: `14-family-tree.png` shows the global `app/error.tsx` fallback — centered H1 "Something went sideways.", a muted line, and two buttons "Try again" (magenta) + "Back to camp" (outline). That is the error state, not this screen. Build the tree from this prompt; flag to the user that the screenshot needs recapturing.
- Off-token status colour: the "Captain" pill uses Tailwind **amber** (`amber-500/15` fill, `amber-300` text in dark) — NOT a brand token. Keep it amber; do not map it onto magenta.
- Search-match highlight: matched rows get an amber-tinted border (`amber-400/60`), also off-token.
- Viewer's own card: magenta `ring-1` outline + the "You" pill (`primary/10` bg, `primary` text).
- The mono invite code on the "via" subline is the only monospace on the screen.
- Multi-state screen: default (roots expanded one level), fully expanded, collapsed, search-filtered (only matching paths show, ancestors force-expanded), and empty. Render the populated default state.
