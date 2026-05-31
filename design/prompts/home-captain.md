# Pencil prompt — home-captain

Reproduce `design/reference/16-home-captain.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The signed-in home control panel for a member whose rank is **captain**. It is the same four-quadrant `ControlPanel` as the member home, but the **Captain** layer is unlocked — all three rank tabs (Me / Team Lead / Captain) are now selectable, with no lock icon on Captain. The captain's own quadrants are Camp Management / Camp Tasks / Finances / Camp Tools, surfaced when the Captain tab is active.

## Layout (top → bottom)

- **Header bar** (~h-14, bottom border): brand "Camp 404" left, bold; right side a bell icon and a circular magenta avatar showing initials "GE".
- **2×2 quadrant grid** filling the body, hairline violet gridlines crossing at centre. The reference shows the **Me** (camp_member) layer active:
  - Top-left: people icon, "My Teams", "Your crews" — corner-aligned top-left.
  - Top-right: checklist icon, "My Tasks", "What's on you" — corner-aligned top-right.
  - Bottom-left: person icon, "My Profile", "You & your data" — corner-aligned bottom-left.
  - Bottom-right: wrench icon, "Tools", "Meals, expenses…" — corner-aligned bottom-right.
- **Centre push-to-talk button**: circular, hot-magenta fill, microphone icon over uppercase wide-tracked "TALK", with a 4px background-coloured ring; overlaps the grid centre.
- **Bottom tab bar** (~h-14, top border, three equal tabs): "Me" active (magenta text + short magenta underline), "Team Lead" and "Captain" both muted but UNLOCKED — no lock icons (this is the captain distinction).

## Copy & components

- Header brand: `Camp 404`. Avatar fallback initials e.g. `GE`.
- Active quadrant labels/hints (verbatim): "My Teams" / "Your crews"; "My Tasks" / "What's on you"; "My Profile" / "You & your data"; "Tools" / "Meals, expenses…".
- Captain-layer labels (for the Captain tab): "Camp Management" / "Roster & statuses"; "Camp Tasks" / "Camp-wide work board"; "Finances" / "Dues & reimbursements"; "Camp Tools" / "Announcements, ops…".
- Centre label: `TALK`. Tab labels: `Me`, `Team Lead`, `Captain`.
- Components (`@camp404/ui`): `ControlPanel` (with `QuadrantTile`, `CentreButton`, `LayerTabBar`), `Avatar` / `AvatarFallback` / `AvatarImage`, lucide icons (`Users`, `ListChecks`, `UserRound`, `Wrench`, `Mic`, `Bell`, `Lock`).

## Tokens

- Page + quadrant tile background: `--color-background` `oklch(0.15 0.05 295)` (`#0d061e`).
- Primary text / headings: `--color-foreground` `oklch(0.97 0.02 330)` (`#f7ecf3`).
- Centre button, active tab text + underline, avatar fill: `--color-primary` `oklch(0.65 0.27 340)` (magenta `rgba(255,0,140,0.92)`).
- Text on the magenta button/avatar: `--color-primary-foreground` `oklch(0.99 0.005 340)`.
- Icons, hints, inactive tab text: `--color-muted-foreground` `oklch(0.7 0.05 325)`.
- Gridlines + header/footer borders: `--color-border` `oklch(0.35 0.1 305)`.
- Hover surface on tiles: `--color-muted` `oklch(0.22 0.06 295)`.

Reference all colours as `var(--color-*)`. Never invent hex.

## Do NOT

- Do NOT invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom OS tab bar, no device frame.
- Do NOT redesign the layout, reorder quadrants, or restyle the tabs.
- Do NOT use a light theme — dark midnight-violet only.

## Notes

- This is a **multi-state** component; the reference captures the Me layer with the Captain tab unlocked. The captain signal is the **absence of a lock icon** on the Team Lead and Captain tabs — render all three tabs as freely selectable.
- Quadrant titles/hints sit in each tile's **outer** corner (tl/tr/bl/br alignment), not centred.
- The centre TALK circle sits ABOVE the grid (z-20) and its background-coloured ring punches a gap in the gridlines where they cross.
- Optional numeric badges pin to a tile's top edge (top-3) in magenta; the reference shows none.
- Type tokens are unspecified — use a neutral geometric sans; mono is only for the terminal motif, not this screen.
