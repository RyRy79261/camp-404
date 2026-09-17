"use client";

import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import type { Availability } from "./types";

// The live availability line beneath the invite-code field. A polite live region
// so screen readers announce the result of the debounced check; success in the
// status-token green, failures in destructive (board S14 availability states).
export function AvailabilityHint({
  availability,
  code,
}: {
  availability: Availability;
  code: string;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex min-h-5 items-center gap-1.5 text-label"
    >
      {code && availability.state === "checking" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Checking availability…
        </span>
      ) : code && availability.state === "available" ? (
        <span className="flex items-center gap-1.5 text-success">
          <CircleCheck className="h-3.5 w-3.5" aria-hidden />
          <span>
            <span className="font-mono">{code}</span> is available.
          </span>
        </span>
      ) : code && availability.state === "taken" ? (
        <span className="flex items-center gap-1.5 text-destructive">
          <CircleX className="h-3.5 w-3.5" aria-hidden />
          <span>
            <span className="font-mono">{code}</span> is already taken — pick
            another.
          </span>
        </span>
      ) : code && availability.state === "invalid" ? (
        <span className="flex items-center gap-1.5 text-destructive">
          <CircleX className="h-3.5 w-3.5" aria-hidden />
          {availability.hint}
        </span>
      ) : null}
    </p>
  );
}
