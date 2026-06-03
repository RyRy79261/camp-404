import { CircleCheckBig } from "lucide-react";

// Post-save confirmation strip on the form-replay detail view (board S15): an
// accent-tinted status row. Presentational — the replay island renders it once
// a save lands.
export function SavedBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl border border-border bg-accent/15 p-3.5 text-label text-foreground"
    >
      <CircleCheckBig className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span>
        Saved. Your answers — and the change log below — are up to date.
      </span>
    </div>
  );
}
