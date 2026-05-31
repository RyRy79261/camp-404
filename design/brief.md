# Camp 404 — design brief (tokens + ground rules for Pencil)

This is the **token + identity source** every Pencil prompt in `design/prompts/`
references. It is transcribed from code, not invented — keep it in sync with
`packages/ui/src/styles/globals.css` (the single `@theme` block) and the hex
mirror in `apps/web/lib/og-image.tsx` / `apps/web/app/manifest.ts`.

See also `docs/design-system.md` (the `@camp404/ui` component + token reference)
and `docs/design-tooling.md` (the pencil.dev workflow).

## Identity

Camp 404 is an internal app for an **Afrikaburn theme camp** — "a calm command
centre for a chaotic desert." The palette is **sampled from a lantern-lit tent
reference photo**: a **midnight-violet** base, **hot magenta** primary, and an
**electric-blue** accent. The surface is:

- **Dark-only.** There is no light theme. Capture and design on the dark theme.
- **Mobile-first.** The app is a `max-w-lg` (≈512px) single-column surface;
  reference screenshots are captured at a 430×932 (iPhone-class) viewport @2x.
- **Terminal/command-centre flavour.** The landing hero is a glitched
  "404 — Camp not found" terminal; type leans monospace for that motif.

## Colour tokens (OKLCH — exact, from `globals.css`)

| Token | OKLCH | Role |
|---|---|---|
| `--color-background` | `oklch(0.15 0.05 295)` | midnight-violet page base |
| `--color-foreground` | `oklch(0.97 0.02 330)` | primary text |
| `--color-primary` | `oklch(0.65 0.27 340)` | hot magenta — dominant brand / CTAs |
| `--color-primary-foreground` | `oklch(0.99 0.005 340)` | text on primary |
| `--color-accent` | `oklch(0.62 0.18 255)` | electric-blue — highlights, focus haloes, 2nd brand |
| `--color-accent-foreground` | `oklch(0.99 0.005 255)` | text on accent |
| `--color-secondary` | `oklch(0.42 0.18 320)` | deeper magenta-violet — quieter interactive surfaces / pills |
| `--color-secondary-foreground` | `oklch(0.98 0.01 330)` | text on secondary |
| `--color-muted` | `oklch(0.22 0.06 295)` | auth-page / recessed surface |
| `--color-muted-foreground` | `oklch(0.7 0.05 325)` | secondary text |
| `--color-card` | `oklch(0.26 0.08 295)` | card — one step lighter than muted (elevated) |
| `--color-card-foreground` | `oklch(0.97 0.02 330)` | text on card |
| `--color-popover` | `oklch(0.26 0.08 295)` | shares the card surface |
| `--color-popover-foreground` | `oklch(0.97 0.02 330)` | text on popover |
| `--color-border` | `oklch(0.35 0.1 305)` | borders (also `--color-input`) |
| `--color-input` | `oklch(0.35 0.1 305)` | input borders |
| `--color-destructive` | `oklch(0.65 0.22 18)` | errors / destructive |
| `--color-destructive-foreground` | `oklch(0.98 0 0)` | text on destructive |
| `--color-ring` | `oklch(0.65 0.27 340)` | focus ring (= primary) |

**Elevation:** `background` (0.15) → `muted` (0.22) → `card`/`popover` (0.26).
Cards sit one step lighter than the page to read as elevated (the login-04
pattern). Borders are a brighter violet (0.35) so edges read on the dark base.

**Radius:** `--radius: 0.625rem` (10px). NB: only `control-grid` currently
consumes `var(--radius)`; most components hardcode Tailwind `rounded-*`. When
recreating, treat 10px as the canonical corner unless a component clearly differs.

## Hex mirror (for Pencil / OG / non-OKLCH contexts)

Hand-maintained in `apps/web/lib/og-image.tsx` and `apps/web/app/manifest.ts`
(a **manual** sync point — does not auto-track the OKLCH tokens):

- Background `#0d061e` · Foreground `#f7ecf3`
- Magenta `rgba(255,0,140,0.92)` · Cyan/accent `rgba(0,220,255,0.92)`

## Typography

No `--font-*` tokens are defined; the app falls back to the Tailwind v4 default
sans stack, with a **monospace** treatment for the terminal/command motif
(landing hero, code-like labels). If a Pencil mock needs a font, use a neutral
geometric sans for body and a mono (ui-monospace / a Berkeley/JetBrains-class
mono) for the terminal accents — and flag that type tokens are still unspecified.

## Ground rules for every Pencil prompt

1. **Anchor HARD to the reference PNG**: "Reproduce `design/reference/<screen>.png`
   exactly; do not redesign." The screenshot is fidelity; the tokens are precision.
2. **Pass the exact tokens above** as backup; reference colours as `var(--color-*)`
   / the hex mirror — never guess hex.
3. **State the theme: dark.** Midnight-violet base, magenta primary dominant,
   electric-blue accent supporting.
4. **Forbid invented chrome.** Camp 404 has **no** iOS status bar, no 9:41 clock,
   no battery, no bottom tab bar. Do not add a phone frame.
5. **Mobile width** (`max-w-lg`, single column).
6. It's generate-from-prompt = **approximation, not a pixel clone** — always
   `--export` and compare side-by-side before calling anything "faithful."
