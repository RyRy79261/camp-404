import type { ReactNode } from "react";
import {
  DutyCardPage,
  dutyCardPageStyles,
  type DutyCardPrint,
} from "@camp404/ui/components/duty-card-print";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import {
  DUTY_CARD_MARGIN_MM,
  DUTY_CARD_SHEET_MM,
  screenPageLabels,
} from "@/lib/duty-card-print";
import { DutyCardScreenPages } from "./duty-card-screen-pages";
import { PrintSheet } from "./print-sheet";

// The app's print of Survival Guide duty cards (#250): the card itself is
// @camp404/ui's (components/duty-card-print.tsx), shared with the public
// guide site; this is the app's sheet around it, with Download PDF.

export { DutyCardPage, dutyCardPageStyles, type DutyCardPrint };

/**
 * The print of one card or of every card, one per page (a long card takes
 * more), in the shared print shell with Download PDF.
 */
export function DutyCardsSheet({
  title,
  cards,
  printed,
  options,
}: {
  title: string;
  cards: readonly DutyCardPrint[];
  printed: string;
  options: ReactNode;
}) {
  // One sheet each until the screen has measured them.
  const labels = screenPageLabels(
    cards.map(() => 0),
    DUTY_CARD_SHEET_MM,
  );
  return (
    <PrintSheet
      area="Survival Guide"
      title={title}
      options={options}
      marginMm={DUTY_CARD_MARGIN_MM}
      paged
    >
      <style>
        {dutyCardPageStyles(cards, printed, `[${PRINT_SHEET_ATTR}] > h1`)}
      </style>
      {cards.map((c, i) => (
        <DutyCardPage
          key={c.key}
          print={c}
          index={i}
          printed={printed}
          screenPage={labels[i] ?? ""}
        />
      ))}
      <DutyCardScreenPages
        sheetHeightMm={DUTY_CARD_SHEET_MM}
        paperWidthMm={210}
      />
    </PrintSheet>
  );
}
