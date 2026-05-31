# Pencil prompt — error-boundary

Reproduce `design/reference/17-error-boundary.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

> This screen was captured by navigating to a DB-backed page (`/captains/camp-management`) under `E2E_TEST_MODE`, where it throws and the app's route-level **error boundary** (`apps/web/app/error.tsx`) renders. It's a genuine, reusable reference for the global crash-recovery state — captured here as a happy accident of the test seam.

## What this screen is
A full-screen error-recovery state shown when an uncaught error is thrown while rendering a page or running a server action inside the app shell. It keeps the user inside the shell with a way to retry or escape home, instead of a raw crash.

## Layout (top → bottom)
- A single centred column on the midnight-violet page background; content is vertically centred in the viewport (full-height, `min-h-[100dvh]`), horizontally centred, all text centred.
- Lots of empty space above and below — the cluster sits at the vertical middle.
- Heading: "Something went sideways." (bold, ~2xl, foreground text).
- Body paragraph below the heading (small, muted): wraps to two lines.
- A horizontal pair of buttons below the copy, centred and spaced: a solid magenta "Try again" then an outline "Back to camp".
- No card, no border around the whole thing — it floats on the bare page. No header, no nav, no icon.

## Copy & components
Quoted exactly from `apps/web/app/error.tsx`:
- Heading: `Something went sideways.`
- Body: `An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know.` (em dash).
- Primary button label: `Try again`
- Outline button label: `Back to camp`

Components (`@camp404/ui`):
- `Button` — default/solid magenta for "Try again"; `variant="outline"` for "Back to camp" (the outline button wraps a `next/link` to `/`).
- Layout is a single `<main>` flex column; `<h1>` + `<p>` in a 2px-gap stack, then a wrapping flex row of buttons (gap-3). No Card/Input/ControlPanel.

## Tokens
- `var(--color-background)` — `oklch(0.15 0.05 295)` / hex `#0d061e` — page base.
- `var(--color-foreground)` — `oklch(0.97 0.02 330)` / hex `#f7ecf3` — heading text.
- `var(--color-muted-foreground)` — `oklch(0.7 0.05 325)` — body paragraph.
- `var(--color-primary)` — `oklch(0.65 0.27 340)` / magenta `rgba(255,0,140,0.92)` — solid "Try again".
- `var(--color-primary-foreground)` — `oklch(0.99 0.005 340)` — text on the magenta button.
- `var(--color-border)` — `oklch(0.35 0.1 305)` — outline-button edge.
- Radius `0.625rem` (10px) on the buttons.

## Do NOT
- Invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no bottom tab bar, no phone frame.
- Redesign or restyle; add an error icon, illustration, card, or border that isn't in the PNG.
- Use a light theme — dark midnight-violet only.
- Add the accent-blue — this screen is magenta + outline only.

## Notes
- No glitch effect here — that motif belongs only to the landing 404 hero.
