# Camp 404 — Design System

Reference for the `@camp404/ui` package so any design-to-code tool (see
[`design-tooling.md`](design-tooling.md)) maps onto what already exists
instead of inventing off-brand markup.

`@camp404/ui` is a shadcn/ui-style component library: Radix primitives,
Tailwind v4, CVA variants, OKLCH design tokens.

## Tokens

Defined in `packages/ui/src/styles/globals.css` via a Tailwind v4 `@theme`
block (no `tailwind.config.js`). Consumed as CSS variables, e.g.
`bg-[color:var(--color-primary)]`.

| Token | Value | Role |
|---|---|---|
| `--color-background` | `oklch(0.99 0 0)` | near-white page background |
| `--color-foreground` | `oklch(0.18 0 0)` | near-black body text |
| `--color-primary` | `oklch(0.55 0.18 32)` | warm orange/red brand accent |
| `--color-primary-foreground` | `oklch(0.98 0 0)` | text on primary |
| `--color-muted` | `oklch(0.96 0 0)` | subtle surfaces / hover states |
| `--color-muted-foreground` | `oklch(0.5 0 0)` | secondary text |
| `--color-border` | `oklch(0.9 0 0)` | hairline borders |
| `--radius` | `0.625rem` | corner radius baseline |

The `@layer base` block applies the border colour globally and sets the
body background/foreground plus `rlig`/`calt` font features.

## Components

In `packages/ui/src/components/`, exported via `@camp404/ui/components/*`:

| Component | Notes |
|---|---|
| `button.tsx` | CVA variants — `default`, `outline`, `ghost`, `destructive`, `secondary`; sizes `default`, `sm`, `lg`, `icon`. Supports `asChild` via Radix `Slot`. |
| `card.tsx` | Surface container. |
| `checkbox.tsx` | Wraps `@radix-ui/react-checkbox`. |
| `input.tsx` | Text input. |
| `label.tsx` | Wraps `@radix-ui/react-label`. |
| `select.tsx` | Wraps `@radix-ui/react-select`. |
| `slider.tsx` | Wraps `@radix-ui/react-slider`. |
| `textarea.tsx` | Multi-line input. |
| `quadrant-nav.tsx` | Camp 404's bespoke four-quadrant home layout with a circular push-to-talk centre button. **v0 — open question per brief §14.1, to be validated before treating as final.** |

Most primitives are thin wrappers over Radix; styling lives in Tailwind
classes referencing the tokens above.

## Conventions

- **Class merging:** `cn()` from `packages/ui/src/lib/utils.ts`
  (`clsx` + `tailwind-merge`).
- **Imports:** `@camp404/ui/components/<name>`, `@camp404/ui/lib/utils`,
  and the stylesheet via `@camp404/ui/styles.css`.
- **Styling:** reference tokens as `var(--color-*)`; do not hard-code hex
  colours.

## For design tools

When generating designs or code:

- Target **shadcn/ui** as the component system.
- Reuse the tokens and components above; prefer an existing component over
  new markup.
- Keep the warm orange/red `--color-primary` as the only brand accent.
