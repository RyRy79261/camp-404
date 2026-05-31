# Pencil prompt — tools-forms

Reproduce `design/reference/09-tools-forms.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The "My forms" list under Tools — it shows the questionnaires the user has completed this year, each as a tappable card that opens for review/update. In the reference there is a single completed form ("Burner profile").

## Layout (top → bottom)

- A back link: a small left chevron (`<`) followed by "Tools", muted-foreground colour, near top-left.
- Page heading "My forms" — large, bold, foreground colour.
- A 3-line descriptive paragraph in muted-foreground directly under the heading.
- One card (the only form), filling the column width with generous internal padding (~24px):
  - Card title "Burner profile" — bold, ~lg, foreground.
  - Card description, 3 lines, muted-foreground.
  - A small "Last edited …" timestamp line below the description, slightly dimmer/smaller (xs).
  - A right-pointing chevron (`>`) vertically centred at the card's right edge, muted-foreground.
- The rest of the screen is empty page background (no footer, no nav).

## Copy & components

- Back link text: `Tools`
- Heading: `My forms`
- Description: `Questionnaires you've completed this year. Open one to review and update your answers — we'll keep a log of what you change.`
- Card title: `Burner profile`
- Card description: `The onboarding questionnaire — who you are in the dust, your teams, skills and logistics.`
- Timestamp: `Last edited 31 May 2026, 16:53` (rendered from `dateFmt`, en-ZA medium date + short time)

Components from `@camp404/ui`: `Card`, `CardHeader`, `CardTitle`, `CardDescription` (the card is wrapped in a Next `Link`; chevrons are lucide `ChevronLeft` / `ChevronRight`). Card is `rounded-xl border bg-card`; on hover the border shifts to primary (magenta) — show the default (non-hover) state.

## Tokens

- Page bg `--color-background` — `oklch(0.15 0.05 295)` (`#0d061e`)
- Body text `--color-foreground` — `oklch(0.97 0.02 330)` (`#f7ecf3`)
- Card surface `--color-card` — `oklch(0.26 0.08 295)` (one step lighter than bg, reads elevated)
- Card text `--color-card-foreground` — `oklch(0.97 0.02 330)`
- Description / back link / timestamp / chevrons `--color-muted-foreground` — `oklch(0.7 0.05 325)`
- Card border `--color-border` — `oklch(0.35 0.1 305)` (brighter violet edge)
- Hover border (not shown, mention only) `--color-primary` — `oklch(0.65 0.27 340)` (`rgba(255,0,140,0.92)`)

Radius: card corners ~12px (`rounded-xl`). Reference colours as `var(--color-*)`; never invent hex beyond the mirror above.

## Do NOT

- Invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal, no bottom tab bar, no phone frame.
- Redesign the layout, add icons, badges, or extra cards.
- Use a light theme — dark midnight-violet only.

## Notes

- Single-column, left-aligned content. The card is the only filled element; everything below it is bare page background — do not fill the empty space.
- Only one form exists in this capture. The empty-state ("You haven't completed any forms yet." in a dashed-border box) and multi-card variants exist in code but are NOT in this reference — render the single-card state shown.
- Card elevation is subtle: it's just one OKLCH-lightness step above the page (0.15 → 0.26) plus a faint shadow and the violet border. Keep contrast quiet.
- No glitch effects, no terminal/mono type on this screen — it's a calm list view.
