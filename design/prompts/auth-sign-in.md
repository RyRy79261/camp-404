# Pencil prompt — auth-sign-in

Reproduce `design/reference/02-auth-sign-in.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The Camp 404 sign-in screen — the Neon-Auth email/password + Google sign-in shell rendered on the muted auth surface. It is the default landing for any unauthenticated visitor (`/auth` redirects to `/auth/sign-in`).

## Layout (top → bottom)

A single vertically-centred card floats on a flat midnight-violet auth surface. No Back button (first screen in the flow). Inside the card, one column, generously spaced:

- **"Welcome back"** — large bold heading, centred.
- Sub-line — muted, centred: "Sign in to your Camp 404 account."
- **Email** field — label above a full-width input with placeholder `you@example.com`.
- **Password** field — label on the left; "Forgot your password?" link pushed to the right on the same row; full-width input below (empty in the reference).
- **Sign in** — full-width solid magenta primary button.
- **"Or continue with"** divider — muted centred text with a horizontal rule running through it on both sides.
- **Continue with Google** — full-width outline button with the Google "G" glyph to the left of the label.

The card has a rounded border and sits one elevation step above the page. Everything else on screen is empty auth surface (top and bottom margins).

## Copy & components

Exact strings (from `app/auth/sign-in-form.tsx`):

- Heading `Welcome back`; sub `Sign in to your Camp 404 account.`
- Labels `Email`, `Password`; right-aligned link `Forgot your password?`
- Email placeholder `you@example.com`; password input has no placeholder.
- Primary button `Sign in` (loading state shows `Signing in…`).
- Divider `Or continue with`; outline button `Continue with Google`.

@camp404/ui components: `Card` + `CardContent` (the `AuthShell` wrapper, `p-6 md:p-8`), `Label`, `Input`, two `Button`s (default/primary for Sign in, `variant="outline"` for Google). The Google "G" is an inline `currentColor` SVG. Form gap is `gap-6`; field groups use `grid gap-2`.

## Tokens

Auth page surface (the `AuthShell` wrapper): `--color-muted` = `oklch(0.22 0.06 295)`.
Card surface (one step lighter, elevated): `--color-card` = `oklch(0.26 0.08 295)` with `--color-card-foreground` = `oklch(0.97 0.02 330)`.
Page/foreground hex mirror: background `#0d061e`, foreground `#f7ecf3`.

- Heading + label text: `var(--color-foreground)` `oklch(0.97 0.02 330)`.
- Sub-line, "Or continue with", input placeholder: `var(--color-muted-foreground)` `oklch(0.7 0.05 325)`.
- Sign in button: `var(--color-primary)` `oklch(0.65 0.27 340)` — hot magenta, hex mirror `rgba(255,0,140,0.92)` — with `var(--color-primary-foreground)` `oklch(0.99 0.005 340)` text.
- Input + outline-button + divider borders: `var(--color-border)` / `var(--color-input)` `oklch(0.35 0.1 305)`.
- Focus ring (not visible at rest): `var(--color-ring)` `oklch(0.65 0.27 340)`.
- Error text (only when validation fails): `var(--color-destructive)` `oklch(0.65 0.22 18)`.
- Corner radius: `--radius` 0.625rem (10px).

The input fills read slightly darker than the card (recessed) — toward the page background.

## Do NOT

- Invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Redesign, re-order, or restyle the login-04 layout.
- Use a light theme — this surface is dark-only.

## Notes

- "Forgot your password?" is a plain underline-on-hover text link (not a button); align it to the right edge of the Password label row.
- No accent (electric-blue) appears on this screen at rest — the only saturated colour is the magenta primary button. Don't add cyan.
- Multi-state (don't render these unless asked): button label swaps to "Signing in…" while loading; a single-line destructive error string can appear above the Sign in button.
- The password input in the reference is empty (no placeholder) — render it as a blank recessed field.
- Type tokens are unspecified for this app; use a neutral geometric sans for all copy here (no terminal mono on this screen).
