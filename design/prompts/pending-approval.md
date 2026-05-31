# Pencil prompt — pending-approval

Reproduce `design/reference/20-pending-approval.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The blocking gate a member sees after onboarding when their redeemed invite still needs captain vetting. It locks the rest of the app: the only ways out are a captain approving them (the app unlocks on next load) or signing out. Rejected applicants land on the SAME component in its terminal state.

## Layout (top → bottom)

A single elevated `Card` is vertically and horizontally centred on a full-height page (`min-h-svh`), set on the recessed `muted` page surface. The card content is a centred column (`flex flex-col items-center gap-6 text-center`):

- A 56px (`h-14 w-14`) circular icon badge at the top, centred.
  - Pending: amber clock icon on a faint amber tint fill.
  - Rejected: red shield-with-x icon on a faint `destructive` tint fill.
- A bold heading (`text-2xl font-bold`).
- A paragraph of muted helper text below it (`text-sm`, balanced/centred, `muted-foreground`).
- A full-width outline "Sign out" button at the bottom of the card.

No back button on this screen (`hideBack`). No footer. No other controls.

## Copy & components

Components: `AuthShell` (page wrapper — centres a `max-w-sm` `Card` + `CardContent` on the `muted` surface), `Card` / `CardContent` (`@camp404/ui/components/card`), `Button` (`@camp404/ui/components/button`, `variant="outline"`, `className="w-full"`), `lucide-react` icons `Clock` and `ShieldX`.

Pending state (20):
- Heading: `Application submitted`
- Body: `Thanks, {name} — your profile is in. A captain needs to approve your access before you can use the rest of the app. We'll let you in as soon as they do; just check back here.` (the reference shows the fallback where the email stands in for the name, e.g. `Thanks, pending@example.com —`).
- Button: `Sign out`

Rejected state (21):
- Heading: `Application not approved`
- Body: `A captain has reviewed your application and it wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you.`
- Button: `Sign out`

## Tokens

Reference as `var(--color-*)`; never invent hex.

- Page surface (behind card): `--color-muted` = `oklch(0.22 0.06 295)`
- Card surface (elevated, one step lighter): `--color-card` = `oklch(0.26 0.08 295)`
- Card border: `--color-border` = `oklch(0.35 0.1 305)`
- Heading / card text: `--color-card-foreground` = `oklch(0.97 0.02 330)` (≈ `#f7ecf3`)
- Helper paragraph: `--color-muted-foreground` = `oklch(0.7 0.05 325)`
- "Sign out" outline button border: `--color-border`; fill reads near page `--color-background` = `oklch(0.15 0.05 295)` (≈ `#0d061e`)
- Rejected icon + tint: `--color-destructive` = `oklch(0.65 0.22 18)` at full strength on a `~10%` fill
- Radius: `--radius` = 10px for the card; the icon badge is fully rounded (`rounded-full`).

## Do NOT

- Do not invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar. No phone frame.
- Do not redesign or relayout — single centred card, icon → heading → body → button.
- Do not use a light theme. Dark midnight-violet only.

## Notes

- Multi-state: this one component renders both `20-pending-approval` (pending) and `21-rejected` (terminal). Document/render both; they differ only in the icon (Clock vs ShieldX), icon tint (amber vs destructive-red), heading, and body copy. Layout is identical.
- The amber pending icon colour is OFF-TOKEN: it uses Tailwind `bg-amber-500/15` + `text-amber-400` (dark), NOT a Camp 404 token. Keep the warm amber clock — do not substitute magenta/accent. The rejected state, by contrast, uses the on-token `--color-destructive`.
- No CTA into the app and no glitch/terminal effects here — this is a calm, quiet dead-end screen. The only action is the outline "Sign out".
- The rejected heading wraps to two lines ("Application not / approved") at this width; let it wrap naturally.
