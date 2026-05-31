# Pencil prompt — captains-announcements

Reproduce `design/reference/18-captains-announcements.png` exactly; do not redesign. Mobile (max-w-lg, ~430px wide), DARK theme.

## What this screen is

The captain-only announcements manager: a composer where a camp captain writes a broadcast, picks how it lands, saves it as a draft, then publishes it to the whole camp. Below the composer are Drafts and Published lists (shown here in their empty state).

## Layout (top → bottom)

- Back link, top-left: a left chevron + "Camp tools" (ghost button, small).
- Page title, large bold, two lines: "Announcements & notifications".
- Muted description paragraph: "Compose a message, save it as a draft, then publish it to the whole camp. Everyone but you receives it. A full-screen announcement takes over each member's screen until they acknowledge it."
- A bordered card ("New announcement") filling the column, containing:
  - Card heading "New announcement" (bold).
  - "Title" label + text input with placeholder "Burn-night briefing".
  - "Message" label + tall multi-line textarea (~6 rows) with placeholder "What does everyone need to know?".
  - "How it lands" label + a select dropdown showing a megaphone icon + "Full-screen — must acknowledge" with a chevron-down on the right.
  - Muted helper text under the select: "Takes over each member's screen. They scroll and press Acknowledge to dismiss."
  - A magenta primary "Save draft" button (pencil icon) aligned bottom-right of the card.
- Below the card, two muted uppercase section headers with empty-state text:
  - "DRAFTS" → "No drafts."
  - "PUBLISHED" → "Nothing published yet."

## Copy & components

Quote verbatim: back link "Camp tools"; title "Announcements & notifications"; card heading "New announcement"; labels "Title", "Message", "How it lands"; placeholders "Burn-night briefing" and "What does everyone need to know?"; select value "Full-screen — must acknowledge"; helper "Takes over each member's screen. They scroll and press Acknowledge to dismiss."; button "Save draft"; section headers "Drafts" / "Published"; empty states "No drafts." / "Nothing published yet."

@camp404/ui components: `Button` (ghost back link + primary "Save draft"), `Input` (Title), `Textarea` (Message), `Label`, `Select` (SelectTrigger / SelectValue / SelectContent / SelectItem). Icons (lucide): ChevronLeft, Megaphone, Pencil. The composer card is a plain bordered `section` (rounded-lg border), not the `Card` component.

## Tokens

- `--color-background` — `oklch(0.15 0.05 295)` / `#0d061e` — page base.
- `--color-foreground` — `oklch(0.97 0.02 330)` / `#f7ecf3` — title, labels, card heading.
- `--color-muted-foreground` — `oklch(0.7 0.05 325)` — description, helper text, input placeholders, "DRAFTS"/"PUBLISHED" headers, empty-state lines.
- `--color-card` — `oklch(0.26 0.08 295)` — composer card surface (one step lighter than the page).
- `--color-border` / `--color-input` — `oklch(0.35 0.1 305)` — card outline, input/textarea/select borders.
- `--color-primary` — `oklch(0.65 0.27 340)` / magenta `rgba(255,0,140,0.92)` — "Save draft" button fill.
- `--color-primary-foreground` — `oklch(0.99 0.005 340)` — text/icon on that button.

Reference as `var(--color-*)`; never invent hex.

## Do NOT

- Do NOT invent iOS/phone chrome: no status bar, no 9:41 clock, no battery, no signal bars, no bottom tab bar, no phone frame.
- Do NOT redesign, restyle, or add a light theme. Dark only.

## Notes

- This is the EMPTY state: the "Save draft" button reads disabled (dim/desaturated magenta) because Title and Message are empty; render it muted-magenta, not full-saturation.
- The card corners are ~10px (`--radius`), inputs slightly tighter; the textarea has a faint resize grip bottom-right.
- "DRAFTS" / "PUBLISHED" are uppercase, letter-spaced, small, muted — section dividers, not buttons.
- The composer is one quiet card on the page base; no glitch/terminal effects on this screen, and no locked-tier overlay (captains-only route, but the screen renders normally).
- The success-notice colour in code is an off-token emerald (`text-emerald-400`); it is NOT visible in this empty state, so do not paint any green here.
