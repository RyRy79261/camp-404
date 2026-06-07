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
import {
  cancelCaptainPromotionAction,
  sendCaptainPromotionAction,
} from "./actions";

// Assign-captain double-opt-in dialog (board S17 AssignCaptain). Captain rank is
// two-sided: sending a request never flips rank — only the target accepting in
// their own app does (on the home / notifications surface). This dialog sends and
// (while the request is still open) can cancel; the step tracker reflects the
// live `{ sent, accepted }` state.

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
  requestId,
  requestIsMine,
  onSent,
  onCancelled,
}: {
  targetUserId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: { sent: boolean; accepted: boolean };
  /** The open request's id, needed to cancel it (null until one is sent). */
  requestId: string | null;
  /** Only the captain who sent the request may cancel it — the server enforces
   * this; gating the affordance keeps the button from being a dead-end. */
  requestIsMine: boolean;
  onSent: (requestId: string) => void;
  onCancelled: () => void;
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
      // The parent records the new request id and flips step 1 to "Done".
      onSent(res.requestId);
    });
  }

  function cancelRequest() {
    if (!requestId) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelCaptainPromotionAction(requestId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCancelled();
    });
  }

  // Single close path (Esc / overlay / close icon / Cancel button) so the
  // transient error is always cleared on the way out and never lingers to the
  // next open. Suppressed mid-send so a request can't be abandoned half-done.
  function requestOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  const canCancel =
    step.sent && !step.accepted && requestId !== null && requestIsMine;

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        className="border-secondary sm:max-w-md"
        showCloseButton={!isPending}
      >
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
            {step.sent ? "Close" : "Cancel"}
          </Button>
          {!step.sent ? (
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={isPending}
              onClick={send}
            >
              {isPending && <Spinner size="sm" />}
              Send request
            </Button>
          ) : canCancel ? (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isPending}
              onClick={cancelRequest}
            >
              {isPending && <Spinner size="sm" />}
              Cancel request
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
