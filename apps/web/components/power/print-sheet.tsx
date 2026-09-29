import type { ReactNode } from "react";
import { PrintButton } from "./print-button";

// A paper sheet for the Power & Lighting team (#255, #256, #257; the printable
// pages of #249): black on white, A4, no desktop around it. It opens in its own
// tab from a power page, and the browser's print dialog saves it as a PDF. The
// Print button and the note above it do not print. There is no signal on
// site, so paper is how these reach the generator station and the set-up
// crew; nothing here is sent anywhere by the app.

export function PrintSheet({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-white text-neutral-900 print:min-h-0">
      {/* The sheet is white on screen and on paper, whatever the app's theme. */}
      <style>
        {
          "@page { size: A4; margin: 14mm; } html, body { background: #fff; color-scheme: light; }"
        }
      </style>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-6 py-3 print:hidden">
        <p className="text-sm text-neutral-600">
          Print this page, or save it as a PDF from the print dialog.
        </p>
        <PrintButton />
      </div>
      <main className="mx-auto flex max-w-[190mm] flex-col gap-5 px-6 py-8 print:max-w-none print:p-0">
        <header className="flex flex-col gap-1 border-b-2 border-neutral-900 pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
            Camp 404 · Power &amp; Lighting
          </p>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-700">{subtitle}</p>}
        </header>
        {children}
      </main>
    </div>
  );
}

/** The sheet's table style: thin black rules that print clearly. */
export const SHEET_TABLE =
  "w-full border-collapse text-sm [&_td]:border [&_td]:border-neutral-400 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-neutral-700 [&_th]:bg-neutral-100 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold";
