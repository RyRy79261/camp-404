# Pencil prompt — mcp-connect

Reproduce `design/reference/15-mcp-connect.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The MCP connection / sign-in bridge for the Claude MCP OAuth authorize flow. An unauthenticated caller lands here to sign in to Camp 404 so Claude can be granted access to their camp data; once a session exists the screen auto-forwards to the authorize endpoint.

## Layout (top → bottom)

The reference PNG shows a centred auth card on the midnight-violet page (generous empty space above and below — the card is vertically centred, single column):

- A single elevated **Card** with rounded corners and a faint violet border, centred horizontally.
- Bold centred heading: **"Welcome back"**.
- Centred muted subtitle: **"Sign in to your Camp 404 account."**
- **Email** field: label "Email" above a dark recessed input with placeholder "you@example.com".
- **Password** field: label "Password" on the left, a "Forgot your password?" link on the right (magenta/foreground), then a dark recessed input below (empty).
- Full-width magenta primary **Button**: "Sign in".
- A centred divider with inline label "Or continue with" (thin border lines flanking the text).
- Full-width dark/outline **Button** with the Google "G" glyph: "Continue with Google".

## Copy & components

Reference PNG (auth sign-in card) copy, verbatim:
- Heading: `Welcome back`
- Subtitle: `Sign in to your Camp 404 account.`
- Field labels: `Email`, `Password`; link `Forgot your password?`
- Email placeholder: `you@example.com`
- Primary button: `Sign in`
- Divider: `Or continue with`
- Social button: `Continue with Google`

Components (from `@camp404/ui`): `Card` (CardHeader/CardTitle/CardDescription/CardContent), `Input` (with field labels), `Button` (primary variant for "Sign in", outline/secondary variant for the Google button). The divider is a hairline rule with centred label text.

## Tokens

Subset this screen uses (OKLCH from `brief.md`, hex mirror where it helps Pencil):

- `var(--color-background)` — `oklch(0.15 0.05 295)` — page base (`#0d061e`).
- `var(--color-foreground)` — `oklch(0.97 0.02 330)` — heading + label text (`#f7ecf3`).
- `var(--color-card)` — `oklch(0.26 0.08 295)` — the elevated auth card surface.
- `var(--color-card-foreground)` — `oklch(0.97 0.02 330)` — text on card.
- `var(--color-muted)` — `oklch(0.22 0.06 295)` — recessed input fill (darker than the card).
- `var(--color-muted-foreground)` — `oklch(0.7 0.05 325)` — subtitle, placeholder, divider label.
- `var(--color-primary)` — `oklch(0.65 0.27 340)` — magenta "Sign in" button (hex mirror `rgba(255,0,140,0.92)`).
- `var(--color-primary-foreground)` — `oklch(0.99 0.005 340)` — text on the magenta button.
- `var(--color-border)` / `var(--color-input)` — `oklch(0.35 0.1 305)` — card edge, input borders, divider lines.
- `var(--radius)` — `0.625rem` (10px) canonical corner.

## Do NOT

- Do NOT invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no device frame.
- Do NOT redesign the layout or relabel anything.
- Do NOT use a light theme — dark midnight-violet only.
- Do NOT guess hex values beyond the tokens above.

## Notes

- Source/reference mismatch (flag for the human): the reference PNG `15-mcp-connect.png` is the **auth sign-in card** ("Welcome back" + email/password + Google). The live source `app/mcp/connect/page.tsx` is a leaner sign-in *bridge* — heading `Connect Claude to Camp 404`, body "Sign in to grant Claude access to your camp data. You'll see what you're approving before the connection completes.", a single outline `Sign in with Google` button, and a footer "New to Camp 404? Sign in first — you'll enter your invite code once you're in." The bridge has no email/password fields. Reproduce the PNG (visual source of truth); the bridge copy is recorded here in case the screenshot is later re-captured against the real route.
- The bridge also renders transient full-screen states: `Loading…`, `Checking session…`, and `Continuing to {next}…` — single centred lines, no card. Not shown in the PNG.
- The card is vertically centred with large top/bottom margins — keep it floating mid-screen, not pinned to the top.
- Inputs are visibly *darker* than the card (recessed `muted` fill inside the lighter `card`), giving the login-04 elevation read.
