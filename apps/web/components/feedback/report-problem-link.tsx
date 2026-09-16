"use client";

import { openReportProblem } from "./report-problem";

/**
 * "Report a problem" on /profile (owner's call, 2026-09-16), for desktops and
 * phones with no motion sensor, where shaking cannot open the reporter. The
 * S09 board does not draw it; it uses the page's own text-link style.
 */
export function ReportProblemLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openReportProblem()}
      className={className}
    >
      Report a problem
    </button>
  );
}
