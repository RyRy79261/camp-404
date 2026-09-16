"use client";

import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";

// Reject-confirm dialog (board S17 RejectConfirm). Rejecting an applicant is
// terminal, so it goes through a confirm step (was a one-click reject before).
// The decision itself runs in the parent (MemberProfile.decide); this only
// gates it behind a confirmation and suppresses dismissal mid-send. Built on
// the shared ConfirmDialog, with the board's own copy.

export function RejectConfirmDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
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
    </ConfirmDialog>
  );
}
