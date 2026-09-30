// The one look for a choice a member picks from: a segment, a radio card, a
// checkbox card, a yes/no pair, a chip. Every choice shows a soft colour, and
// the picked one is bright (owner, 2026-09-30: "I want the colors on the
// screens always visible, to lighten the appearance up a bit").
//
// Only the kit's tokens, mixed where the choice is drawn, so each follows the
// theme it sits in (a 404 OS theme inside a window, the kit's own colours
// outside one). Mixed in oklab, not oklch: the card's grey carries a faint
// blue hue of its own, and an oklch mix turns toward it (a 12% magenta mix
// comes out blue-grey). apps/web/lib/__tests__/os-skin-contrast.test.ts reads
// the percentages below and measures the text on each surface, in every theme.
//
// Written out whole, not built from parts: Tailwind finds a class only as a
// literal in the source.

/** A choice not picked: a soft tint of the main colour, full-strength text. */
export const CHOICE_OFF =
  "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-card))] text-foreground hover:bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-card))]";

/**
 * A picked card or row (it carries a description, a picture or a tick in the
 * main colour, so it keeps the page's text colours): a stronger tint inside a
 * solid edge of the main colour.
 */
export const CHOICE_ON =
  "border-primary bg-[color-mix(in_oklab,var(--color-primary)_16%,var(--color-card))] text-foreground ring-1 ring-primary";

/** A picked segment, number or chip: filled with the main colour. */
export const CHOICE_ON_FILL =
  "border-primary bg-primary text-primary-foreground";
