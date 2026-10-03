"use client";

import { useLayoutEffect } from "react";
import { screenPageLabels } from "@/lib/duty-card-print";

// The duty card print's page numbers on screen (#250). Paper counts its own
// sheets (the footer is in the page margin, counter(page)); on screen a long
// card is one tall sheet, so this measures each card once it is drawn and
// writes "page 1 of 3" or "pages 2–3 of 3" in its screen footer. The card's
// words are as wide on screen as on paper, so the count matches the print.

export function DutyCardScreenPages({
  sheetHeightMm,
  paperWidthMm,
}: {
  /** The height a sheet gives the card on paper: A4 less the margins. */
  sheetHeightMm: number;
  paperWidthMm: number;
}) {
  useLayoutEffect(() => {
    const cards = [
      ...document.querySelectorAll<HTMLElement>("[data-testid='duty-card']"),
    ];
    const heights = cards.map((card) => {
      const width = card.getBoundingClientRect().width;
      const words = card.querySelector<HTMLElement>("[data-card-words]");
      if (!words || width === 0) return 0;
      // Zoom-proof: both sizes come from the same, possibly scaled, box.
      return (words.getBoundingClientRect().height / width) * paperWidthMm;
    });
    const labels = screenPageLabels(heights, sheetHeightMm);
    cards.forEach((card, i) => {
      const slot = card.querySelector<HTMLElement>("[data-screen-page]");
      if (slot && labels[i]) slot.textContent = labels[i];
    });
  }, [sheetHeightMm, paperWidthMm]);
  return null;
}
