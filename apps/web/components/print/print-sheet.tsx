import type { ReactNode } from "react";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { PaperFit } from "./paper-fit";
import { DownloadPdfButton, PrintButton } from "./print-actions";

// The one print shell (#249). Every printable page is drawn in it, so every
// sheet looks the same: A4 paper only, never a phone layout (owner,
// 2026-10-01), black on white whatever the app's theme, no
// desktop around it, and a header line (Camp 404 · the area), the title and
// an optional line under it. Above the sheet, on screen only, a bar with the
// page's own choices (a back link, the day, the sheet) and the two buttons:
// Download PDF, which makes a real file of this page on the server
// (app/print/pdf/route.ts), and Print, the browser's dialog.
//
// There is no signal on site, so paper is how these reach the camp. Rules for
// every print: first names, with a surname initial only to tell two apart; no
// phone, email, ID, bank or medical details; a food allergy only as a count. The
// page that uses the shell keeps the same permission gate as its screen; a
// refusal is drawn WITHOUT the shell, so it can never be saved as a PDF.

export function PrintSheet({
  area,
  title,
  subtitle,
  options,
  orientation = "portrait",
  children,
}: {
  /** The part of the camp the sheet is from: "Power & Lighting", "Kitchen". */
  area: string;
  title: string;
  subtitle?: ReactNode;
  /** The page's own links in the bar (never printed): back, day, sheet. */
  options?: ReactNode;
  orientation?: "portrait" | "landscape";
  children: ReactNode;
}) {
  const landscape = orientation === "landscape";
  return (
    <div className="min-h-svh bg-neutral-200 text-neutral-900 [text-rendering:geometricPrecision] print:min-h-0 print:bg-white">
      {/* White paper on screen and on paper, whatever the app's theme.
          geometricPrecision: Chromium on Linux (the PDF route's, and a
          phone's scaled sheet) otherwise rounds each letter's width to a
          whole pixel, and with the headings' letter-spacing the error
          gathers into gaps inside words ("MET HOD", "rins ed") and swallows
          spaces ("tbspGround"). Exact widths keep the words whole. */}
      <style>
        {`@page { size: A4${landscape ? " landscape" : ""}; margin: 14mm; } html, body { background: #fff; color-scheme: light; }`}
      </style>
      <div className="border-b border-neutral-300 bg-neutral-50 print:hidden">
        <div className="mx-auto flex max-w-[297mm] flex-wrap items-start justify-between gap-3 px-4 py-3">
          <nav
            aria-label="Print options"
            className="flex min-h-9 flex-wrap items-center gap-2 text-sm text-neutral-700"
          >
            {options ?? <span>Download it as a PDF, or print it.</span>}
          </nav>
          <div className="ml-auto flex flex-wrap items-start gap-2">
            <DownloadPdfButton title={title} />
            <PrintButton />
          </div>
        </div>
      </div>
      {/* The sheet is always A4 wide, with the page's margins inside it, so
          the screen shows the page as it prints; a narrow window scales it
          down to fit (paper-fit.tsx) rather than reflowing it. */}
      <div className="px-3 py-6 print:p-0">
        <PaperFit widthMm={landscape ? 297 : 210}>
          <main
            {...{ [PRINT_SHEET_ATTR]: "" }}
            className={`flex flex-col gap-5 bg-white p-[14mm] shadow-md print:w-auto print:p-0 print:shadow-none ${landscape ? "w-[297mm] min-h-[210mm]" : "w-[210mm] min-h-[297mm]"} print:min-h-0`}
          >
            <header className="flex flex-col gap-1 border-b-2 border-neutral-900 pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
                Camp 404 · {area}
              </p>
              <h1 className="text-2xl font-bold">{title}</h1>
              {subtitle && (
                <p className="text-sm text-neutral-700">{subtitle}</p>
              )}
            </header>
            {children}
          </main>
        </PaperFit>
      </div>
    </div>
  );
}

/** A refusal or a missing sheet, outside the shell: never a PDF. */
export function PrintRefusal({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-white px-6 py-8 text-neutral-900">
      <div className="mx-auto max-w-[190mm] text-base">{children}</div>
    </div>
  );
}
