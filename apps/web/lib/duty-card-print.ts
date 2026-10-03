import { printableDutyCard } from "@camp404/core";
import type { DutyCardDraft } from "@camp404/types";
import type { DutyCardPrint } from "@/components/print/duty-card";

// The duty card print's small rules (#250), pure so they are unit-tested: how
// many sheets each card takes and the page words its screen footer shows.

/**
 * "page 1 of 1", "pages 2–3 of 4": each card's sheets, counted through the
 * whole print, from the height of each card's words and of a sheet (any one
 * unit). A card always takes at least one sheet.
 */
export function screenPageLabels(
  heights: readonly number[],
  sheetHeight: number,
): string[] {
  const sheets = heights.map((h) =>
    sheetHeight > 0 ? Math.max(1, Math.ceil(h / sheetHeight - 1e-6)) : 1,
  );
  const total = sheets.reduce((a, b) => a + b, 0);
  let first = 1;
  return sheets.map((n) => {
    const label =
      n === 1
        ? `page ${first} of ${total}`
        : `pages ${first}–${first + n - 1} of ${total}`;
    first += n;
    return label;
  });
}

/** The duty card print's footer line, before "Printed …". */
export function dutyCardFooter(
  at: { version: number; published: string } | { draftSaved: string },
): string {
  return "version" in at
    ? `Survival Guide · version ${at.version} · updated ${at.published}`
    : `Survival Guide · draft, not published · saved ${at.draftSaved}`;
}

/** A4 portrait less the print's top and bottom margins, in mm. */
export const DUTY_CARD_MARGIN_MM = 12;
export const DUTY_CARD_SHEET_MM = 297 - 2 * DUTY_CARD_MARGIN_MM - 2;

/** A card as the print draws it, from a published card or a saved draft. */
export function toDutyCardPrint(input: {
  key: string;
  title: string;
  team: string | null;
  teamLabel: string;
  card: DutyCardDraft;
  markdown: string;
  usedBy: readonly { id: string; name: string; timeText: string }[];
  footer: string;
  draft?: boolean;
}): DutyCardPrint {
  return {
    key: input.key,
    title: input.title,
    team: input.team,
    teamLabel: input.teamLabel,
    draft: input.draft ?? false,
    card: printableDutyCard(input.card),
    markdown: input.markdown,
    usedBy: input.usedBy.map(({ id, name, timeText }) => ({
      id,
      name,
      timeText,
    })),
    footer: input.footer,
  };
}
