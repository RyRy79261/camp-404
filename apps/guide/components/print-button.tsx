"use client";

// Print, through the browser's own dialog (owner, 2026-10-04: Print only on
// the public site, no Download PDF; the dialog offers Save as PDF itself).

export function PrintButton({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="currentColor"
        aria-hidden="true"
      >
        <rect x="3" y="0" width="8" height="4" />
        <rect x="0" y="5" width="14" height="6" />
        <rect x="3" y="9" width="8" height="5" fill="var(--bg)" />
      </svg>
      {label}
    </button>
  );
}
