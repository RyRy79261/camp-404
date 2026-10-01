"use client";

import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { pdfFileName, pdfHref } from "@/lib/print";

// The two buttons on every print page (#249), styled for the white sheet
// rather than the desktop's theme. Neither prints.
//  - Download PDF (the owner's ruling 2026-09-30: a real file): asks the
//    server for a PDF of this very page and saves it. Only this button spins
//    while the file is made; a failure says so beside it.
//  - Print: the browser's print dialog, for a printer next to you.

const BUTTON =
  "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:opacity-60";

/** What the member reads when the file could not be made, by the route's status. */
export function pdfFailure(status: number): string {
  if (status === 401 || status === 403) return "You cannot print this page.";
  if (status === 429)
    return "Too many PDFs at once. Wait a minute and try again.";
  return "The PDF could not be made. Try again.";
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`${BUTTON} border border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-100`}
    >
      <Printer className="h-4 w-4" aria-hidden />
      Print
    </button>
  );
}

export function DownloadPdfButton({ title }: { title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const here = `${window.location.pathname}${window.location.search}`;
      const response = await fetch(pdfHref(here, title), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError(pdfFailure(response.status));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFileName(title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Let the download start before the address is let go.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(pdfFailure(0));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        className={`${BUTTON} bg-neutral-900 text-white hover:bg-neutral-700`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {busy ? "Making the PDF…" : "Download PDF"}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
