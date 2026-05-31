# Pencil prompt — home-member

Reproduce `design/reference/07-home-member.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The signed-in camp member's home — Camp 404's layered four-quadrant `ControlPanel` on its lowest "Me" layer. It is the command-centre launcher: four navigation quadrants framing a central push-to-talk button, with locked higher-rank tiers waiting at the bottom.

## Layout (top → bottom)

- **Header bar** (h-14, bottom border): "Camp 404" wordmark bold on the left; on the right a notification bell outline icon and a circular magenta avatar showing initials "GE". No badge on the bell in this state.
- **2×2 quadrant grid** filling the body, divided by thin violet hairline borders (a vertical line down the centre, a horizontal line across the middle). Each tile is corner-aligned toward the screen edge:
  - **Top-left**: small two-person (Users) icon, then "My Teams" (bold), then "Your crews" (muted). Left-aligned.
  - **Top-right**: checklist (ListChecks) icon, "My Tasks", "What's on you". Right-aligned.
  - **Bottom-left**: single-person (UserRound) icon, "My Profile", "You & your data". Left-aligned, anchored to the bottom of the tile.
  - **Bottom-right**: wrench (Wrench) icon, "Tools", "Meals, expenses…". Right-aligned, anchored bottom.
- **Centre push-to-talk button**: a solid hot-magenta circle floating over the grid intersection, ringed by a thick background-coloured halo (so the hairlines appear to pass behind it). Inside: a microphone icon above the uppercase letter-spaced label "TALK". Soft drop shadow.
- **Bottom tab bar** (h-14, top border): three rank tabs. "Me" active in magenta with a short magenta underline; "Team Lead" and "Captain" muted, each followed by a small padlock icon (locked, view-only).

## Copy & components

- Header wordmark: `Camp 404`. Right slot from `HomeHeader`: notifications `Bell` icon + `Avatar`/`AvatarFallback` initials.
- Quadrant labels / hints (exact): "My Teams" / "Your crews"; "My Tasks" / "What's on you"; "My Profile" / "You & your data"; "Tools" / "Meals, expenses…".
- Centre label: `TALK` (uppercase, tracking `0.15em`).
- Tab labels: `Me`, `Team Lead`, `Captain` (the two non-active tabs carry a `Lock` icon).
- Components: `@camp404/ui` `ControlPanel` (with `QuadrantTile`, `CentreButton`, `LayerTabBar`), `Avatar` + `AvatarImage` + `AvatarFallback`. Icons from lucide-react: `Users`, `ListChecks`, `UserRound`, `Wrench`, `Mic`, `Bell`, `Lock`.

## Tokens

- `--color-background` `oklch(0.15 0.05 295)` (`#0d061e`) — page base, quadrant tile fills, centre-button halo ring.
- `--color-foreground` `oklch(0.97 0.02 330)` (`#f7ecf3`) — wordmark, quadrant titles, bell icon.
- `--color-primary` `oklch(0.65 0.27 340)` (magenta, `rgba(255,0,140,0.92)`) — centre TALK circle, avatar fallback fill, active "Me" tab text + underline.
- `--color-primary-foreground` `oklch(0.99 0.005 340)` — mic icon, "TALK" label, avatar initials.
- `--color-muted-foreground` `oklch(0.7 0.05 325)` — quadrant hint text, quadrant icons, inactive tab labels + their padlocks.
- `--color-border` `oklch(0.35 0.1 305)` — grid hairlines, header/tab-bar dividers.

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no OS bottom tab/home bar. The only bottom bar is the rank tab bar described above.
- Do not redesign the quadrant/centre layout or relabel anything.
- Do not use a light theme. Dark midnight-violet only.

## Notes

- Corner-anchoring matters: top tiles hug the top edge, bottom tiles hug the bottom edge; left tiles are left-aligned, right tiles right-aligned — content radiates toward the screen corners, leaving the centre open for the TALK button.
- The grid "lines" are just the `gap-px` border colour showing between four background-coloured tiles — not drawn strokes. The thick ring around the centre button is `ring-4` in the background colour, which is why the hairlines look interrupted there.
- Locked tiers: "Team Lead" and "Captain" tabs are browsable-but-locked (padlock, muted). In this member state they are NOT active — only "Me" is. Do not lock or dim the quadrant tiles themselves; on the member layer they are fully active.
- No notification badge and no quadrant badges are visible in this reference (badges exist in the component but are absent here).
