"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { formatMoney } from "@camp404/core";
import { CLAIM_NOTE_MAX } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { formatDay } from "@/lib/dues-view";
import { decideClaimAction } from "./actions";

// One team's claims waiting for its yes (#242). "Approve" is a one-tap change
// on a list row: a failure is a toast and only that button spins. "Not
// approved" asks for an optional reason in a dialog, and a problem with what
// was typed shows there.

export interface ApprovalRow {
  id: string;
  submitterName: string;
  description: string;
  amountCents: number;
  spentOn: string | null;
  /** The viewer's own claim: someone else decides it. */
  own: boolean;
}

export function ClaimApprovals({ rows }: { rows: ApprovalRow[] }) {
  return (
    <ul aria-label="Claims waiting" className="divide-y divide-border">
      {rows.map((row) => (
        <ApprovalItem key={row.id} row={row} />
      ))}
    </ul>
  );
}

function ApprovalItem({ row }: { row: ApprovalRow }) {
  const router = useRouter();
  const [approving, startApprove] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = approving || rejecting;

  function approve() {
    startApprove(async () => {
      const res = await decideClaimAction({
        claimId: row.id,
        decision: "approved",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Approved ${formatMoney(row.amountCents)} for ${row.submitterName}.`,
      );
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startReject(async () => {
      const res = await decideClaimAction({
        claimId: row.id,
        decision: "rejected",
        note,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Marked not approved. They'll see it on their claims.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-3 py-3 page-sm:flex-row page-sm:items-start page-sm:justify-between">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium tabular-nums">
            {formatMoney(row.amountCents)}
          </span>
          <span className="text-sm">{row.submitterName}</span>
        </span>
        <span className="text-sm">{row.description}</span>
        {row.spentOn && (
          <span className="text-xs text-muted-foreground">
            Bought {formatDay(row.spentOn)}
          </span>
        )}
      </span>
      {row.own ? (
        <span className="text-xs text-muted-foreground">
          Your own claim: someone else decides it.
        </span>
      ) : (
        <span className="flex shrink-0 gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={approve}>
            {approving ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setOpen(true)}
          >
            <X aria-hidden />
            Not approved
          </Button>
        </span>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Not approve this claim?"
        description={`${row.submitterName}'s claim for ${formatMoney(row.amountCents)} will not be paid. They see it on their claims, with your reason.`}
        confirmLabel="Not approved"
        pending={rejecting}
        error={error}
        onConfirm={reject}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`claim-note-${row.id}`}>Why (optional)</Label>
          <Textarea
            id={`claim-note-${row.id}`}
            rows={2}
            maxLength={CLAIM_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            disabled={rejecting}
          />
        </div>
      </ConfirmDialog>
    </li>
  );
}
