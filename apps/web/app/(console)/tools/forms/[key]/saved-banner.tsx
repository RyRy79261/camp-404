import { CircleCheckBig } from "lucide-react";

// Post-save confirmation strip on the form-replay view: a success-tinted
// status row, as the AfrikaBurn camp page draws a confirmation. Presentational
// — the replay island renders it once a save lands.
export function SavedBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-foreground"
    >
      <CircleCheckBig
        className="mt-0.5 h-4 w-4 shrink-0 text-success"
        aria-hidden
      />
      <span>Saved. Your answers — and the change log — are up to date.</span>
    </div>
  );
}
