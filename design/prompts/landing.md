# Pencil prompt — landing

Reproduce `design/reference/01-landing.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The signature brand screen: a glitched "404 — Camp not found" terminal hero that doubles as the marketing landing / entry point. Preserve the glitch + terminal command-centre aesthetic — it is the identity of the app.

## Layout (top → bottom)

A single centered column on a midnight-violet base, vertically distributed (top group, giant centre glyph, bottom CTA group), with full-bleed scanline + noise texture over everything:

- **Top eyebrow group** (near top, centered):
  - Tiny widely-tracked label `CAMP 404` in muted violet.
  - Below it, a slightly larger monospace line `ERROR 404 — CAMP NOT FOUND` in near-white with a chromatic-aberration shadow (magenta offset left, cyan offset right).
- **Vertical centre**: a giant, heavy monospace `404` glyph in near-white, with magenta + cyan RGB-split copies bleeding off the edges (chromatic aberration / broken-display tear).
- **Bottom CTA group** (centered, above the lower edge):
  - Full-width hot-magenta pill button `Are you lost?` (rounded, white label).
  - Below it, a faint monospace terminal line `$ AWAITING INPUT_` in muted violet with a blinking-cursor feel.
- **Background texture (full screen, behind all content):** faint horizontal scanlines, subtle noise grain, and a soft vertical scan-beam sweep tinted violet/magenta.

## Copy & components

Exact strings (mono lines render uppercase via CSS — show them uppercase as in the PNG):

- Eyebrow: `Camp 404` (renders `CAMP 404`)
- Subhead (mono, chromatic): `Error 404 — Camp not found` (renders `ERROR 404 — CAMP NOT FOUND`)
- Hero glyph: `404`
- Primary CTA (links to `/auth/sign-in`): `Are you lost?`
- Terminal footer (mono): `$ awaiting input_` (renders `$ AWAITING INPUT_`)

Components from `@camp404/ui`: **Button** (`size="lg"`, full width, asChild wrapping an anchor). Everything else is plain typographic/decorative markup — no Card, Input, or ControlPanel on this screen.

## Tokens

Subset actually used (reference as `var(--color-*)`):

- `--color-background` `oklch(0.15 0.05 295)` (hex `#0d061e`) — page base.
- `--color-foreground` `oklch(0.97 0.02 330)` (hex `#f7ecf3`) — the `404` glyph, base glyph layer, subhead text.
- `--color-muted-foreground` `oklch(0.7 0.05 325)` — `CAMP 404` eyebrow and `$ awaiting input_` footer.
- `--color-primary` `oklch(0.65 0.27 340)` (magenta, hex mirror `rgba(255,0,140,0.92)`) — the CTA button fill and the magenta RGB-split layer.
- `--color-primary-foreground` `oklch(0.99 0.005 340)` — `Are you lost?` label on the button.
- `--color-accent` `oklch(0.62 0.18 255)` (electric-blue; cyan glitch mirror `rgba(0,220,255,0.92)`) — the cyan RGB-split layer.

Radius: 10px (`--radius`) canonical for the button corners.

## Do NOT

- Do NOT invent iOS / phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no notch, no phone frame.
- Do NOT redesign the layout or swap the glitch motif for anything cleaner.
- Do NOT use a light theme — dark midnight-violet only.
- Do NOT guess hex values outside the tokens above.

## Notes

- **Glitch is the point.** The `404` must show chromatic aberration: a magenta copy offset slightly left and a cyan copy offset slightly right of a near-white base, with horizontal "tear" slices implying a broken display. The subhead carries the same magenta-left / cyan-right split shadow.
- **Mono font** for the `404`, the subhead, and the footer line (ui-monospace / JetBrains-class). Type tokens are unspecified in the system — flag if a substitute is needed.
- **Static capture of a multi-state animation:** the live screen shakes/tears and the cursor blinks. Capture a representative single frame (split visible, glyph centered) — do not animate.
- **Texture layers** (scanlines + noise + scan-beam) are low-opacity overlays at ~4-6%; keep them subtle so the `404` and CTA stay dominant.
- The hero glyph is very large (≈30vw, clamps 7rem–14rem), heavy weight (900), tight tracking; it should dominate the vertical centre.
