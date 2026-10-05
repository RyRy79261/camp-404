# Camp 404 — Design System

Reference for how Camp 404 looks in code, so a person or a design tool maps
onto what exists instead of inventing off-brand markup. The rules and the
owner's rulings behind them are in the Design section of
[`AGENTS.md`](../AGENTS.md#design).

[CORRECTION 2026-09-29] This page described one OKLCH magenta palette in
`@camp404/ui`, a four-quadrant home (`quadrant-nav.tsx`) and a layered
`control-panel.tsx`. The control panel and quadrant nav are gone (#288), and
the kit's tokens are now AfrikaBurn's. It is rewritten below to match the code.

## Three looks

| Where                                                            | Look                                       | Defined in                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| The console: the desktop, every program window, the gate screens | The 404 OS skin, in one of four themes     | `apps/web/app/globals.css`, `apps/web/lib/os-themes.ts`, `packages/os/src/styles.css` |
| The sign-in pages                                                | AfrikaBurn's kit with Camp 404 magenta     | `packages/ui/src/styles/globals.css` (`.camp-accent` on `<html>`)                     |
| The signed-out landing page                                      | Camp 404's own glitch design, never themed | `apps/web/app/landing-hero.tsx`, which sets its own palette and font                  |

The join site wears the 404 OS palette and is never themed.

### The 404 OS skin

- Midnight violet, magenta and electric blue, through the `--os-*` variables;
  Silkscreen (the pixel face) for the chrome and Inter for body text
  (`app/layout.tsx`); square corners.
- While a `data-os-skin` marker is on the page, `<html>` carries `os-skinned`
  (`lib/os-skin.ts`), and `:root.os-skinned` points the kit's tokens at the OS
  palette, so Radix popovers and toasts portalled into `<body>` wear it too.
- Themes: 404 Night, Calm, High contrast and Colour-blind safe
  (`lib/os-themes.ts`). A new colour is a new token in every theme, never a
  literal; `lib/__tests__/os-themes.test.ts` and `os-skin-contrast.test.ts`
  hold each theme to it.
- A kit part the skin restyles further carries a `data-slot` (badge, button,
  card, …) or `data-kpi` (a headline number tile).

### The kit's tokens

`packages/ui/src/styles/globals.css` is AfrikaBurn's "Tankwa Night" file:
shadcn semantic tokens in a Tailwind v4 `@theme` block (no
`tailwind.config.js`), dark first, Montserrat, with AfrikaBurn's brand ramp
(`--color-ab-teal`, `--color-ab-apricot`, …). Camp 404's `.camp-accent` skin
changes only the interactive colours to Camp 404 magenta. Use the tokens as
CSS variables or Tailwind utilities, e.g. `bg-primary`,
`text-muted-foreground`.

The same file defines the window-width variants `page-sm:`, `page-md:`,
`page-lg:` and `page-xl:`. They measure the window's body
(`data-page-container`), so a page lays itself out by its window, not the
screen.

## Components

In `packages/ui/src/components/`, imported as
`@camp404/ui/components/<name>`. Most are thin wrappers over Radix with CVA
variants. The groups:

- **Form parts:** `button`, `input`, `input-field`, `password-input`,
  `textarea`, `checkbox`, `select`, `combobox`, `slider`, `segmented-control`,
  `option-card-group`, `date-control`, `field`, `label`.
- **Surfaces and feedback:** `card`, `alert`, `badge`, `dialog`,
  `confirm-dialog`, `popover`, `dropdown-menu`, `empty-state`, `progress-bar`,
  `toast`.
- **Data:** `table`, `responsive-data-table` (a table on a wide window, cards
  on a narrow one).
- **Page parts:** `page-heading` (every console page starts with it),
  `captain-lock`, `notification-bell`.
- **Account:** `avatar`, `avatar-upload`, and the `account-*` sign-in and
  security panels (password, passkeys, sessions, two-factor).

The desktop itself (windows, taskbar, Start menu, folders) is not in the kit:
it is `@camp404/os`, and the console's shell around it is
`apps/web/components/os/`.

## Conventions

- **Class merging:** `cn()` from `@camp404/ui/lib/utils` (`clsx` +
  `tailwind-merge`).
- **Imports:** `@camp404/ui/components/<name>`, `@camp404/ui/lib/utils`, and
  the stylesheet via `@camp404/ui/styles.css`.
- **Styling:** reference tokens, never a hex or OKLCH literal in a component.
- **A new surface:** copy the composition of the nearest existing program's
  window and restyle only with tokens. Do not invent a design.

## Storybook

`@camp404/ui` ships a Storybook (Storybook 10, React + Vite).

```bash
pnpm --filter @camp404/ui storybook         # dev server on :6006
pnpm --filter @camp404/ui build-storybook   # static build → storybook-static/
```

- Config lives in `packages/ui/.storybook/` (`main.ts`, `preview.ts`).
  Tailwind v4 is wired in with the `@tailwindcss/vite` plugin, and
  `globals.css` is imported in `preview.ts` so the tokens resolve.
- Stories sit beside their component as `*.stories.tsx`, grouped under
  `Components/*`. Storybook shows the kit's tokens, not the 404 OS skin.
- `storybook-static/` is a build artefact and is gitignored.

To add a story, create `<component>.stories.tsx` beside the component,
default-export a `Meta`, and export one `StoryObj` per state.
