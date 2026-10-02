import type { CSSProperties, ReactNode } from "react";
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
// phone, email, ID, bank or medical details; a food allergy only as a count,
// except on the daily site sheet, whose allergy line names who (owner,
// 2026-10-02: the cooks act on it), gated at team lead and audited. The
// page that uses the shell keeps the same permission gate as its screen; a
// refusal is drawn WITHOUT the shell, so it can never be saved as a PDF.
//
// A print of several pages, each with its own header and footer (the daily
// site sheet: a day's sheet and its General page, for one day or every day),
// passes `paged` and draws each page as a <PrintPage>. The title is then for
// the file name and for screen readers only.

export function PrintSheet({
  area,
  title,
  subtitle,
  options,
  orientation = "portrait",
  marginMm = 14,
  paged = false,
  children,
}: {
  /** The part of the camp the sheet is from: "Power & Lighting", "Kitchen". */
  area: string;
  title: string;
  subtitle?: ReactNode;
  /** The page's own links in the bar (never printed): back, day, sheet. */
  options?: ReactNode;
  orientation?: "portrait" | "landscape";
  /** The paper's margin, all round. */
  marginMm?: number;
  /** Children are <PrintPage>s, each its own sheet of paper. */
  paged?: boolean;
  children: ReactNode;
}) {
  const landscape = orientation === "landscape";
  const size = landscape ? "w-[297mm]" : "w-[210mm]";
  return (
    <div className="min-h-svh bg-neutral-200 text-neutral-900 [text-rendering:geometricPrecision] print:min-h-0 print:bg-white">
      {/* White paper on screen and on paper, whatever the app's theme.
          geometricPrecision: Chromium on Linux (the PDF route's, and a
          phone's scaled sheet) otherwise rounds each letter's width to a
          whole pixel, and with the headings' letter-spacing the error
          gathers into gaps inside words ("MET HOD", "rins ed") and swallows
          spaces ("tbspGround"). Exact widths keep the words whole. */}
      <style>
        {`@page { size: A4${landscape ? " landscape" : ""}; margin: ${marginMm}mm; } html, body { background: #fff; color-scheme: light; }`}
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
          {paged ? (
            <main
              {...{ [PRINT_SHEET_ATTR]: "" }}
              className={`flex flex-col gap-6 print:w-auto print:gap-0 ${size}`}
              style={
                {
                  "--paper-margin": `${marginMm}mm`,
                  "--paper-height": landscape ? "210mm" : "297mm",
                } as CSSProperties
              }
            >
              <h1 className="sr-only">{title}</h1>
              {children}
            </main>
          ) : (
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
          )}
        </PaperFit>
      </div>
    </div>
  );
}

/**
 * One sheet of paper in a `paged` PrintSheet: the header (Camp 404 · the
 * area, the page's title, a line under it, and anything beside it, such as a
 * key), the page, and a footer line pinned to the bottom. On screen it is the
 * A4 page with the paper's margin inside it; on paper, the margin is the
 * printer's and each page starts a new sheet.
 */
export function PrintPage({
  area,
  title,
  subtitle,
  aside,
  footer,
  footerEnd,
  label,
  children,
}: {
  area: string;
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  footerEnd?: ReactNode;
  /** What the page is, for screen readers: "Day 3 General page". */
  label?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label ?? title}
      className="flex min-h-[var(--paper-height)] w-full flex-col bg-white p-[var(--paper-margin)] shadow-md break-after-page print:min-h-[calc(var(--paper-height)_-_2*var(--paper-margin)_-_2mm)] print:p-0 print:shadow-none print:last:break-after-auto"
    >
      <header className="flex items-end justify-between gap-6 border-b-2 border-neutral-900 pb-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
            Camp 404 · {area}
          </p>
          <h2 className="mt-px mb-0.5 text-[21px] font-bold leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-neutral-700">{subtitle}</p>
          )}
        </div>
        {aside}
      </header>
      <div className="mt-2.5 flex-1">{children}</div>
      {(footer || footerEnd) && (
        <footer className="mt-3 flex justify-between gap-4 border-t border-neutral-300 pt-1 text-[9px] text-neutral-600">
          <span>{footer}</span>
          <span>{footerEnd}</span>
        </footer>
      )}
    </section>
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
