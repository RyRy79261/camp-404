import { Lock } from "lucide-react";

// Shared preview-but-locked panel (decision D3): a captain surface renders the
// page chrome for everyone, then this in place of the data for viewers without
// clearance — the server withholds the data, this explains why.
//
// P6: promote to `@camp404/ui/components/captain-lock` when the component-library
// organism lands, and update the import sites (captains/tools + announcements).

export function CaptainLock({
  title = "VIEW ONLY",
  message = "No data for your rank.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border bg-muted/40">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
        {title}
      </p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
