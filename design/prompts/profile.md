# Pencil prompt — profile

Reproduce `design/reference/11-profile.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The signed-in burner's profile view — shows identity (avatar, name, rank, email), an entry point to edit the profile, and quiet links to revisit the questionnaire or sign out.

## Layout (top → bottom)

- A single elevated rounded `Card` filling the column width, with generous interior padding; everything inside is centred.
- Large circular avatar (~128px) at the top of the card, magenta-violet fill with white uppercase initials ("GE"). No image is set in the reference, so it falls back to initials.
- Large bold name heading directly under the avatar (`god@example.com` in the reference — the email doubles as display name when no name is set).
- A small rounded-full rank pill ("Member") on a deeper magenta-violet surface.
- Muted-grey email line under the pill (`god@example.com`).
- A magenta primary `Button` "Edit profile" with a small pencil icon on the left, sitting below the identity block, still inside the card.
- Below the card (outside it), centred muted helper text spanning two lines with an inline underlined link: "Want to update your burner questionnaire answers? Review them here."
- Below that, a centred muted underlined "Sign out" link.

## Copy & components

- Heading: the user's display name or, fallback, their email — reference shows `god@example.com`.
- Rank pill: `Member` (also possible: `Captain`).
- Email line: `god@example.com`.
- Button label: `Edit profile` (leading `Pencil` icon from lucide-react).
- Helper paragraph: `Want to update your burner questionnaire answers? Review them here.` ("Review them here" is the underlined link; the period is outside the link).
- `Sign out` — underlined link.
- Components (`@camp404/ui`): `Avatar` / `AvatarFallback` (initials), `Card` + `CardContent`, `Button` (asChild → link). The helper text and sign-out are plain centred `<p>` links, not components.

## Tokens

- Page base `--color-background` `oklch(0.15 0.05 295)` — hex `#0d061e`.
- Text `--color-foreground` `oklch(0.97 0.02 330)` — hex `#f7ecf3`.
- Card surface `--color-card` `oklch(0.26 0.08 295)` (one step lighter than the page — elevated).
- Card border `--color-border` `oklch(0.35 0.1 305)` (brighter violet edge).
- Rank pill fill `--color-secondary` `oklch(0.42 0.18 320)`; pill text `--color-secondary-foreground` `oklch(0.98 0.01 330)`.
- Avatar fallback fill reads as a deep magenta-violet (secondary family); initials in foreground white.
- Primary button `--color-primary` `oklch(0.65 0.27 340)` — magenta `rgba(255,0,140,0.92)`; label `--color-primary-foreground` `oklch(0.99 0.005 340)`.
- Muted text (email, helper, sign-out) `--color-muted-foreground` `oklch(0.7 0.05 325)`.
- Radius: 10px canonical corners (`--radius: 0.625rem`); the rank pill is fully rounded; the avatar is a full circle.

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Do not redesign the layout or add a header/nav.
- Do not use a light theme — dark midnight-violet only.
- Do not invent hex values beyond the mirror above.

## Notes

- The card is the only elevated surface; the two link rows live on the bare page background below it, with clear vertical gap between card and helper text.
- Avatar has no photo in the reference — render the initials fallback, not a placeholder image icon.
- "Edit profile" is the sole solid magenta CTA; the questionnaire and sign-out links are deliberately quiet (muted, underlined) so the CTA stays dominant.
- Single state — no glitch effect, no locked tiers, no loading/empty variants on this screen.
