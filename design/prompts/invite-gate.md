# Pencil prompt — invite-gate

Reproduce `design/reference/04-invite-gate.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The post-auth invite gate. A user who has signed in but has no invite code on file lands here and cannot reach the questionnaire until they enter a valid code. Single field ("Invite code") plus an "Enter camp" submit button.

## Layout (top → bottom)

- Full-bleed midnight-violet page (`--color-muted`), content vertically and horizontally centred in a single column.
- One elevated rounded Card (`--color-card`, ~10px corners, thin brighter-violet border) holding all the content, generous padding. No Back button (this is the first screen of the flow).
- Inside the card, centred:
  - Heading "One more thing" — large, bold.
  - Sub-paragraph, muted, balanced/centred over ~3 lines: "You're signed in as **newbie@example.com**." (email shown in brighter foreground weight) then "Camp 404 is invite-only — drop your code below to come aboard."
- Left-aligned label "Invite code" above a single empty Input (dark recessed fill, full width).
- Full-width magenta primary Button "Enter camp".
- Centred muted link-style button "Sign out" below the CTA.
- Below the card, small centred muted footer text: "Camp 404 is invite-only."

## Copy & components

- Heading: `One more thing` (`<h1>`, text-2xl font-bold).
- Body: `You're signed in as ` + email (`newbie@example.com`, foreground weight) + `. Camp 404 is invite-only — drop your code below to come aboard.` (text-sm, muted-foreground).
- Field label: `Invite code` (@camp404/ui `Label`, htmlFor invite-code).
- Field: empty @camp404/ui `Input` (no placeholder).
- Primary CTA: `Enter camp` (@camp404/ui `Button`, full width). Pending state label is `Checking…` — render the default `Enter camp`.
- Secondary: `Sign out` (@camp404/ui `Button` variant="link", muted-foreground, links to /auth/sign-out).
- Footer: `Camp 404 is invite-only.` (text-xs, muted-foreground, centred under card).
- Container: @camp404/ui `Card` + `CardContent` inside the `AuthShell` (centred `min-h-svh`, `--color-muted` page bg).

## Tokens

Use these tokens; never invent hex.

- Page background: `var(--color-muted)` — `oklch(0.22 0.06 295)`.
- Card surface: `var(--color-card)` — `oklch(0.26 0.08 295)` (one step lighter than page = elevated).
- Card / input border: `var(--color-border)` / `var(--color-input)` — `oklch(0.35 0.1 305)`.
- Heading / email emphasis text: `var(--color-foreground)` — `oklch(0.97 0.02 330)` (hex mirror `#f7ecf3`).
- Body / label-secondary / "Sign out" / footer: `var(--color-muted-foreground)` — `oklch(0.7 0.05 325)`.
- Primary "Enter camp" button: `var(--color-primary)` — `oklch(0.65 0.27 340)` (hot magenta, hex mirror `rgba(255,0,140,0.92)`).
- Primary button text: `var(--color-primary-foreground)` — `oklch(0.99 0.005 340)`.
- Focus ring (if shown): `var(--color-ring)` = primary magenta.
- Input fill reads darker than the card — closer to the page base `var(--color-background)` `oklch(0.15 0.05 295)` (hex mirror `#0d061e`).

Radius: 10px (`--radius: 0.625rem`) as the canonical corner.

## Do NOT

- Invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Add a Back button (this screen passes `hideBack`).
- Redesign the layout, reorder elements, or add icons/illustrations.
- Use a light theme. Dark midnight-violet only.

## Notes

- This is the first screen in the signup flow, so the AuthShell Back button is intentionally absent.
- The email in the body is dynamic; render the reference value `newbie@example.com` in a brighter foreground weight inline within the muted sentence.
- The Input is empty in the reference (no placeholder text) and visibly recessed — fill it darker than the card so it reads as a well.
- Multi-state component: an inline error paragraph in `var(--color-destructive)` `oklch(0.65 0.22 18)` (role="alert") can appear above the CTA on a bad code, and the button label becomes `Checking…` while pending — neither is shown in the reference; render the default empty/idle state.
