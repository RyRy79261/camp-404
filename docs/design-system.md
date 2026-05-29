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

Palette sampled from the lantern-lit tent reference photo: hot magenta
primary, electric-blue accent, midnight-violet base.

| Token | Value | Role |
|---|---|---|
| `--color-background` | `oklch(0.15 0.05 295)` | midnight-violet page background |
| `--color-foreground` | `oklch(0.97 0.02 330)` | warm-white body text |
| `--color-primary` | `oklch(0.65 0.27 340)` | hot magenta brand accent |
| `--color-primary-foreground` | `oklch(0.99 0.005 340)` | text on primary |
| `--color-secondary` | `oklch(0.42 0.18 320)` | deep magenta-violet surface for secondary buttons / pills |
| `--color-secondary-foreground` | `oklch(0.98 0.01 330)` | text on secondary |
| `--color-accent` | `oklch(0.62 0.18 255)` | electric-blue highlight / focus halo (second brand colour) |
| `--color-accent-foreground` | `oklch(0.99 0.005 255)` | text on accent |
| `--color-muted` | `oklch(0.22 0.06 295)` | auth-page / subtle surface |
| `--color-muted-foreground` | `oklch(0.7 0.05 325)` | secondary text |
| `--color-card` | `oklch(0.26 0.08 295)` | elevated card surface (one step above muted) |
| `--color-card-foreground` | `oklch(0.97 0.02 330)` | text on card |
| `--color-popover` | `oklch(0.26 0.08 295)` | popover surface (shares card elevation) |
| `--color-popover-foreground` | `oklch(0.97 0.02 330)` | text on popover |
| `--color-border` | `oklch(0.35 0.1 305)` | hairline borders |
| `--color-input` | `oklch(0.35 0.1 305)` | input borders |
| `--color-destructive` | `oklch(0.65 0.22 18)` | warm-red destructive accent |
| `--color-destructive-foreground` | `oklch(0.98 0 0)` | text on destructive |
| `--color-ring` | `oklch(0.65 0.27 340)` | focus ring (matches primary) |
| `--radius` | `0.625rem` | corner radius baseline |

The `@layer base` block applies the border colour globally and sets the
body background/foreground plus `rlig`/`calt` font features.

## Components

In `packages/ui/src/components/`, exported via `@camp404/ui/components/*`:

| Component | Notes |
|---|---|
| `avatar.tsx` | Circular avatar wrapping `@radix-ui/react-avatar`. Exports `Avatar`, `AvatarImage`, `AvatarFallback`; the fallback renders initials over the secondary token while the image loads or when none is set. Sized by `className` (e.g. `h-8 w-8` in the header, `h-32 w-32` on the profile page). |
| `button.tsx` | CVA variants — `default`, `outline`, `ghost`, `destructive`, `secondary`; sizes `default`, `sm`, `lg`, `icon`. Supports `asChild` via Radix `Slot`. |
| `card.tsx` | Surface container. |
| `checkbox.tsx` | Wraps `@radix-ui/react-checkbox`. |
| `input.tsx` | Text input. |
| `label.tsx` | Wraps `@radix-ui/react-label`. |
| `select.tsx` | Wraps `@radix-ui/react-select`. |
| `slider.tsx` | Wraps `@radix-ui/react-slider`. |
| `textarea.tsx` | Multi-line input. |
| `quadrant-nav.tsx` | Camp 404's bespoke four-quadrant home layout with a circular push-to-talk centre button. **v0 — open question per brief §14.1, to be validated before treating as final.** |
| `control-panel.tsx` | Layered four-quadrant control panel. Three stacked layers (camp member → team lead → captain); the centre circle (30% of panel width) cycles between them. Layers above the viewer's rank stay visible but locked. Exports `ControlPanel`, `ControlPanelHeader`, `RANK_LABEL`. |

Most primitives are thin wrappers over Radix; styling lives in Tailwind
classes referencing the tokens above.

### `ControlPanel` rank model

`ControlPanel` takes a `viewerRank` (`camp_member` | `team_lead` | `captain`)
and an ordered `layers` array. A layer whose `rank` is above the viewer's is
rendered but locked — the quadrant tiles are non-interactive and carry no
data, so a member can browse what each rank's tools look like without seeing
their contents.

`ControlPanelRank` is **UI-local on purpose**: the app derives a viewer's
rank from their `Role` and team-lead assignments (a camp member becomes
`team_lead` by being made lead of a team group). Reconciling this with the
`Role` enum in `@camp404/types` is a deliberate follow-up.

## Conventions

- **Class merging:** `cn()` from `packages/ui/src/lib/utils.ts`
  (`clsx` + `tailwind-merge`).
- **Imports:** `@camp404/ui/components/<name>`, `@camp404/ui/lib/utils`,
  and the stylesheet via `@camp404/ui/styles.css`.
- **Styling:** reference tokens as `var(--color-*)`; do not hard-code hex
  colours.

## Storybook

`@camp404/ui` ships a Storybook (Storybook 9, React + Vite) so components can
be developed and reviewed in isolation.

```bash
pnpm --filter @camp404/ui storybook         # dev server on :6006
pnpm --filter @camp404/ui build-storybook   # static build → storybook-static/
```

- Config lives in `packages/ui/.storybook/` (`main.ts`, `preview.ts`).
  Tailwind v4 is wired in via the `@tailwindcss/vite` plugin, and
  `globals.css` is imported in `preview.ts` so tokens resolve.
- Stories sit next to their component as `*.stories.tsx` and are grouped
  under `Components/*` (primitives) and `Control Panel/*` (the bespoke
  navigation components). Every component in the table above has a story.
- `storybook-static/` is a build artefact and is gitignored.

To add a story for a new component, create `<component>.stories.tsx` beside
it, default-export a `Meta`, and export one `StoryObj` per state.

## For design tools

When generating designs or code:

- Target **shadcn/ui** as the component system.
- Reuse the tokens and components above; prefer an existing component over
  new markup.
- Treat hot magenta `--color-primary` as the dominant brand colour and
  electric-blue `--color-accent` as the supporting accent; reach for
  those before introducing a new hue.
