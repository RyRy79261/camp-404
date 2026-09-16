"use client";

import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";

// Reject-confirm dialog (board S17 RejectConfirm). Rejecting an applicant is
// terminal, so it goes through a confirm step (was a one-click reject before).
// The decision itself runs in the parent (MemberProfile.decide); this only
// gates it behind a confirmation and suppresses dismissal mid-send. Built on
// the shared ConfirmDialog, with the board's own copy. The optional reason
// (owner's call: a rejection carries a reason) is not drawn on the board; it
// reuses the Label + Textarea pair the bug report dialog uses.

export function RejectConfirmDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
  reason,
  onReasonChange,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** What the member is told, shown on their application screen. */
  reason: string;
  onReasonChange: (reason: string) => void;
  pending: boolean;
  /** A failed decision surfaces here so it isn't occluded by the dialog. */
  error?: string | null;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      pending={pending}
      error={error}
      destructive
      title="Reject application"
      description="They'll be told the application wasn't approved. This can't be undone here."
      cancelLabel="Keep pending"
      confirmLabel="Reject"
    >
      <p className="font-mono text-lg font-bold text-foreground">
        Reject {name}&apos;s application?
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reject-reason">Reason for {name} (optional)</Label>
        <Textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => onReasonChange(e.currentTarget.value)}
          rows={3}
          maxLength={500}
          disabled={pending}
          placeholder="They see this on their application screen."
        />
      </div>
    </ConfirmDialog>
  );
}
