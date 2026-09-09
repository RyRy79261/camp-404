"use client";

import { Download } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// The download half of the CSV export (§7.3). It hands the browser bytes it was
// given and does nothing else.
//
// THERE IS NO CSV LOGIC HERE. The file is built on the server by
// `buildQuestionnaireCsvExport` from @camp404/core, which owns the BOM, the
// CRLF terminators, quote doubling, formula neutralisation and the label path
// the screen also renders through. A second escaper living in this file is
// exactly how an export comes to disagree with the table above it — the two
// copies that existed here differed on whether a stored `-3` gets rewritten as
// `'-3`, and only one of them was tested against a real spreadsheet's rules.

export function ExportCsvButton({
  filename,
  content,
  mimeType,
  disabled = false,
}: {
  filename: string;
  /** The complete file, BOM and all — see `buildQuestionnaireCsvExport`. */
  content: string;
  mimeType: string;
  disabled?: boolean;
}) {
  function download() {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    // Revoke on the next tick, not inline. Some browsers read the blob
    // asynchronously after click(), so revoking immediately can cancel the
    // download it was meant to start.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={download}
      disabled={disabled}
    >
      <Download className="h-4 w-4" aria-hidden />
      Export CSV
    </Button>
  );
}
