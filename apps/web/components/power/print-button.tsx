"use client";

import { Printer } from "lucide-react";

// Opens the browser's print dialog, where the sheet prints or saves as a PDF.
// Styled for the white sheet rather than the desktop's theme.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
    >
      <Printer className="h-4 w-4" aria-hidden />
      Print
    </button>
  );
}
