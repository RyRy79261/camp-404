"use client";

import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";

// Reject-confirm dialog (board S17 RejectConfirm). Rejecting goes through a
// confirm step. The decision itself runs in the parent; this only gates it
// behind a confirmation and suppresses dismissal mid-send. Built on the shared
// ConfirmDialog.
//
// Three versions share it:
// - `application`: the board's own copy, except the board's "This can't be
//   undone here." A decision can now be reversed (owner's call, 2026-09-16),
//   so the sentence says how.
// - `offboard`: taking an approved member out of camp (owner's call: reject
//   with a reason and remove them from teams, can undo). No board draws it.
// - `bulk`: rejecting several applicants from the Pending filter. No board
//   draws it.
// The optional reason is not drawn on the board either; it reuses the Label +
// Textarea pair the bug report dialog uses.

export type RejectMode =
  | { kind: "application"; name: string }
  | { kind: "offboard"; name: string }
  | { kind: "bulk"; count: number };

function copyFor(mode: RejectMode) {
  switch (mode.kind) {
    case "application":
      return {
        title: "Reject application",
        description:
          "They'll be told the application wasn't approved. You can re-open it later.",
        question: `Reject ${mode.name}'s application?`,
        reasonLabel: `Reason for ${mode.name} (optional)`,
        cancelLabel: "Keep pending",
        confirmLabel: "Reject",
      };
    case "offboard":
      return {
        title: "Remove from camp",
        description:
          "They lose access to the app and come off this year's teams. You can approve them again later, but their teams won't come back.",
        question: `Remove ${mode.name} from camp?`,
        reasonLabel: `Reason for ${mode.name} (optional)`,
        cancelLabel: "Keep them",
        confirmLabel: "Remove from camp",
      };
    case "bulk":
      return {
        title: "Reject applications",
        description:
          "They'll be told their applications weren't approved. You can re-open each one later.",
        question:
          mode.count === 1
            ? "Reject 1 application?"
            : `Reject ${mode.count} applications?`,
        reasonLabel:
          mode.count === 1
            ? "Reason (optional)"
            : `Reason for all ${mode.count} (optional)`,
        cancelLabel: "Keep pending",
        confirmLabel: `Reject ${mode.count}`,
      };
  }
}

export function RejectConfirmDialog({
  mode,
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
  reason,
  onReasonChange,
}: {
  mode: RejectMode;
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
  const copy = copyFor(mode);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      pending={pending}
      error={error}
      destructive
      title={copy.title}
      description={copy.description}
      cancelLabel={copy.cancelLabel}
      confirmLabel={copy.confirmLabel}
    >
      <p className="font-mono text-lg font-bold text-foreground">
        {copy.question}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reject-reason">{copy.reasonLabel}</Label>
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
