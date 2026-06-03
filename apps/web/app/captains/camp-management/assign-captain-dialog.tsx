"use client";

import { useState, useTransition } from "react";
import { Circle, CircleCheck, ShieldPlus } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Spinner } from "@camp404/ui/components/spinner";
import { cn } from "@camp404/ui/lib/utils";
import { sendCaptainPromotionAction } from "./actions";

// Assign-captain double-opt-in dialog (board S17 AssignCaptain). Captain rank is
// two-sided: sending a request never flips rank — only the target accepting in
// their own app does (on the home / notifications surface). This dialog only
// sends; the step tracker reflects the live `{ sent, accepted }` state.

/** The two-step "you send → they accept" contract indicator. */
function OptInStepTracker({
  sent,
  accepted,
}: {
  sent: boolean;
  accepted: boolean;
}) {
  const steps = [
    { label: "You send the request", done: sent },
    { label: "They accept in their app", done: accepted },
  ];
  return (
    <ol className="flex flex-col gap-3 rounded-lg border bg-muted p-3.5">
      {steps.map((step) => (
        <li key={step.label} className="flex items-center gap-2.5">
          {step.done ? (
            <CircleCheck aria-hidden className="h-4 w-4 text-accent" />
          ) : (
            <Circle aria-hidden className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="flex-1 font-mono text-label text-foreground">
            {step.label}
          </span>
          <span
            className={cn(
              "font-mono text-caption font-bold",
              step.done ? "text-accent" : "text-muted-foreground",
            )}
          >
            {step.done ? "Done" : "Pending"}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AssignCaptainDialog({
  targetUserId,
  name,
  open,
  onOpenChange,
  step,
  onSent,
}: {
  targetUserId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: { sent: boolean; accepted: boolean };
  onSent: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await sendCaptainPromotionAction(targetUserId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistically flip step 1 to "Done"; the parent revalidates the row.
      onSent();
    });
  }

  // Single close path (Esc / overlay / close icon / Cancel button) so the
  // transient error is always cleared on the way out and never lingers to the
  // next open.
  function requestOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="border-secondary sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldPlus
              aria-hidden
              className="h-4 w-4 text-secondary-foreground"
            />
            Assign captain
          </DialogTitle>
          <DialogDescription>
            Captain is the highest rank in camp. They must accept the request in
            their own app before it takes effect — this is a two-sided
            agreement, so you can&apos;t assign it for them.
          </DialogDescription>
        </DialogHeader>

        <p className="font-mono text-lg font-bold text-foreground">
          Make {name} a captain?
        </p>

        <OptInStepTracker sent={step.sent} accepted={step.accepted} />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={isPending}
            onClick={() => requestOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={isPending || step.sent}
            onClick={send}
          >
            {isPending && <Spinner size="sm" />}
            {step.sent ? "Request sent" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
