// The one look for a choice a member picks from: a segment, a radio card, a
// checkbox card, a yes/no pair, a chip. Every choice shows a soft colour, and
// the picked one is bright (owner, 2026-09-30: "I want the colors on the
// screens always visible, to lighten the appearance up a bit").
//
// Only tokens. An app may set the four colours a choice wears where it draws
// one: --color-choice (not picked), --color-choice-hover, --color-choice-edge
// and --color-pick (picked). The console sets them inside a program window
// from its theme (the desktop's blue, owner 2026-10-01; apps/web
// app/globals.css). Unset (a dialog, a page outside a window), a choice mixes
// the main colour into the card. Mixed in oklab, not oklch: the card's grey
// carries a faint blue hue of its own, and an oklch mix turns toward it.
// apps/web/lib/__tests__/os-skin-contrast.test.ts reads both and measures the
// text on each surface, in every theme.
//
// Written out whole, not built from parts: Tailwind finds a class only as a
// literal in the source.

/**
 * A choice not picked: a soft colour, full-strength text. A
 * choice's quiet text (a description) is lifted toward the text colour, so it
 * keeps 4.5:1 on the tint.
 */
export const CHOICE_OFF =
  "border-[var(--color-choice-edge,color-mix(in_oklab,var(--color-primary)_40%,var(--color-border)))] bg-[var(--color-choice,color-mix(in_oklab,var(--color-primary)_14%,var(--color-card)))] text-foreground hover:bg-[var(--color-choice-hover,color-mix(in_oklab,var(--color-primary)_18%,var(--color-card)))] [&_.text-muted-foreground]:text-[color-mix(in_oklab,var(--color-muted-foreground)_60%,var(--color-foreground))]";

/**
 * A picked card or row (it carries a description, a picture or a tick in the
 * main colour, so it keeps the page's text colours): the brightest fill of
 * its group, inside a solid edge of the main colour.
 */
export const CHOICE_ON =
  "border-primary bg-[var(--color-pick,color-mix(in_oklab,var(--color-primary)_24%,var(--color-card)))] text-foreground ring-1 ring-primary [&_.text-muted-foreground]:text-[color-mix(in_oklab,var(--color-muted-foreground)_60%,var(--color-foreground))]";

/** A picked segment, number or chip: filled with the main colour. */
export const CHOICE_ON_FILL =
  "border-primary bg-primary text-primary-foreground";
