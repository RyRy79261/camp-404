"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { formatMoney } from "@camp404/core";
import { CLAIM_NOTE_MAX } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Label } from "@camp404/ui/components/label";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RowActions } from "@camp404/ui/components/row-actions";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { formatDay } from "@/lib/dues-view";
import { decideClaimAction } from "./actions";

// One team's claims waiting for its yes (#242), as a table that turns into
// cards in a narrow window. Every row keeps its buttons in one place:
// "Approve" first, then "Turn down" (the Finance tab's word for the same
// thing), and on the viewer's own claim a quiet "Your own claim" in that
// slot, since someone else decides it. Approve is a one-tap change on a list
// row: a failure is a toast and only that button spins. Turn down asks for an
// optional reason in a dialog, and a problem with what was typed shows there.

export interface ApprovalRow {
  id: string;
  submitterName: string;
  description: string;
  amountCents: number;
  spentOn: string | null;
  /** The viewer's own claim: someone else decides it. */
  own: boolean;
}

const COLUMNS: ResponsiveColumn<ApprovalRow>[] = [
  {
    id: "who",
    header: "Who",
    role: "title",
    cellClassName: "font-medium",
    cell: (r) => r.submitterName,
  },
  { id: "what", header: "What for", cell: (r) => r.description },
  {
    id: "bought",
    header: "Bought",
    cellClassName: "whitespace-nowrap text-muted-foreground",
    cell: (r) => (r.spentOn ? formatDay(r.spentOn) : "—"),
  },
  {
    id: "amount",
    header: "Amount",
    align: "right",
    cellClassName: "whitespace-nowrap font-medium tabular-nums",
    cell: (r) => formatMoney(r.amountCents),
  },
  {
    id: "actions",
    header: "Actions",
    role: "actions",
    hideHeader: true,
    align: "right",
    cell: (r) => <ApprovalActions row={r} />,
  },
];

export function ClaimApprovals({
  rows,
  label = "Claims waiting",
}: {
  rows: ApprovalRow[];
  label?: string;
}) {
  return (
    <ResponsiveDataTable
      columns={COLUMNS}
      data={rows}
      getRowKey={(r) => r.id}
      label={label}
      stackBelow="md"
    />
  );
}

function ApprovalActions({ row }: { row: ApprovalRow }) {
  const router = useRouter();
  const [approving, startApprove] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = approving || rejecting;

  if (row.own) {
    return (
      <RowActions
        label={`Actions for ${row.submitterName}'s claim`}
        primary={
          <Badge variant="outline" title="Someone else decides your own claim.">
            Your own claim
          </Badge>
        }
      />
    );
  }

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
      toast.success("Turned down. They'll see it on their claims.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <RowActions
        label={`Actions for ${row.submitterName}'s claim`}
        primary={
          <Button type="button" size="sm" disabled={busy} onClick={approve}>
            {approving ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            Approve
          </Button>
        }
        secondary={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setOpen(true)}
          >
            <X aria-hidden />
            Turn down
          </Button>
        }
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Turn this claim down?"
        description={`${row.submitterName}'s claim for ${formatMoney(row.amountCents)} will not be paid. They see it on their claims, with your reason.`}
        confirmLabel="Turn down"
        destructive
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
    </>
  );
}
