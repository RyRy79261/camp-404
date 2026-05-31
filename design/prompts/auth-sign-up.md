# Pencil prompt — auth-sign-up

Reproduce `design/reference/03-auth-sign-up.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The Camp 404 account-creation screen — the sign-up variant of the email/password + Google auth flow. A burner lands here to set credentials before the camp questionnaire. It is open (no invite gate at this step).

## Layout (top → bottom)

A single elevated card, vertically centred on a midnight-violet page with generous padding above and below. No back button on this variant (it is the first screen in the flow). Inside the card, a single column with even vertical spacing:

- Centred bold heading "Create your account".
- Two-line centred muted subheading beneath it.
- Field group "Email" — label above a full-width input showing placeholder `you@example.com`.
- Field group "Password" — label above an empty full-width input.
- Field group "Confirm password" — label above an empty full-width input.
- Full-width solid magenta primary button "Create account".
- A horizontal divider with centred inline text "Or continue with" (the rule passes behind, text knocked out over the card fill).
- Full-width outline button "Continue with Google" with the multi-colour-style "G" mark rendered monochrome (currentColor) to the left of the label.
- Centred muted footer line "Already have an account? Sign in" with "Sign in" underlined as a link.

Note: input fills read noticeably darker than the card (they use the page `background`, not the card surface), so each field is a dark well inset into the lighter card.

## Copy & components

Exact strings (from `apps/web/app/auth/sign-up-form.tsx`):

- Heading: "Create your account"
- Subheading: "Set a password or continue with Google. We'll ask the rest in the questionnaire."
- Labels: "Email", "Password", "Confirm password"
- Email placeholder: "you@example.com"
- Primary button: "Create account"
- Divider: "Or continue with"
- Secondary button: "Continue with Google"
- Footer: "Already have an account? Sign in"

Components (`@camp404/ui`): `Card` + `CardContent` (the AuthShell surface), `Label`, `Input`, `Button` (default/magenta variant for "Create account", `outline` variant for Google). Wrapped by `components/auth-shell.tsx`.

## Tokens

Subset this screen uses (OKLCH from `brief.md`, with hex mirror where it helps):

- Page base: `var(--color-muted)` `oklch(0.22 0.06 295)` — the recessed auth-page violet.
- Card surface: `var(--color-card)` `oklch(0.26 0.08 295)` — one step lighter, reads as elevated.
- Input fill: `var(--color-background)` `oklch(0.15 0.05 295)` ≈ `#0d061e` — the darkest wells.
- Primary button: `var(--color-primary)` `oklch(0.65 0.27 340)` ≈ magenta `rgba(255,0,140,0.92)`; text `var(--color-primary-foreground)` `oklch(0.99 0.005 340)`.
- Heading / body text: `var(--color-foreground)` `oklch(0.97 0.02 330)` ≈ `#f7ecf3`.
- Subheading / footer / divider text: `var(--color-muted-foreground)` `oklch(0.7 0.05 325)`.
- Borders (inputs, outline button, divider rule): `var(--color-border)` / `var(--color-input)` `oklch(0.35 0.1 305)`.

Radius: 10px (`--radius`); buttons/inputs are `rounded-md`. Never invent hex outside the mirror.

## Do NOT

- Do NOT invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Do NOT redesign, re-order, or rename fields/buttons.
- Do NOT use a light theme — dark, midnight-violet only.
- Do NOT add a "Back" button (this variant passes `hideBack`).

## Notes

- The "G" mark is a single-path glyph filled with `currentColor` — keep it monochrome (matching the button text), not Google's four-colour logo.
- Inputs are intentionally darker than the card; preserve that two-tone depth rather than flattening fields into the card fill.
- Magenta primary is the only saturated element; the accent electric-blue does not appear here. Keep everything else violet/muted so the "Create account" CTA dominates.
- Multi-state: the primary button has a loading state with text "Creating account…" and a destructive-coloured inline error line can appear above it — not shown in this reference, do not draw them.
