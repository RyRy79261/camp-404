"use client";

import { TriangleAlert } from "lucide-react";
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

// Reject-confirm dialog (board S17 RejectConfirm). Rejecting an applicant is
// terminal, so it goes through a confirm step (was a one-click reject before).
// The decision itself runs in the parent (MemberProfile.decide); this only
// gates it behind a confirmation and suppresses dismissal mid-send.

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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
      }}
    >
      <DialogContent className="border-destructive sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert
              aria-hidden
              className="h-4 w-4 text-destructive"
            />
            Reject application
          </DialogTitle>
          <DialogDescription>
            They&apos;ll be told the application wasn&apos;t approved. This
            can&apos;t be undone here.
          </DialogDescription>
        </DialogHeader>
        <p className="font-mono text-lg font-bold text-foreground">
          Reject {name}&apos;s application?
        </p>
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
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Keep pending
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Spinner size="sm" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
