"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Eye, FileText, Loader2, X } from "lucide-react";
import { formatMoney } from "@camp404/core";
import { CLAIM_NOTE_MAX, type ClaimStatus } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { claimReceiptPath } from "@/lib/claims-copy";
import { CLAIM_BADGE } from "@/lib/claims-view";
import { formatDay } from "@/lib/dues-view";
import { payClaimAction, readClaimAccountAction } from "../claims-actions";

// The Finance team's claims (#242). "Mark paid" and "Show bank details" are
// one-tap changes on a list row: a failure is a toast, and only that control
// spins. "Turn down" asks for a reason in a dialog, where a problem with what
// was typed shows.

export interface FinanceClaim {
  id: string;
  teamLabel: string;
  submitterName: string;
  description: string;
  amountCents: number;
  spentOn: string | null;
  status: ClaimStatus;
  decisionNote: string | null;
  approverName: string | null;
  /** The receipt file ids, in the member's order. */
  files: string[];
  /** The viewer's own claim: someone else in Finance pays it. */
  own: boolean;
}

export function ClaimsPayManager({
  yearLabel,
  rows,
}: {
  yearLabel: string;
  rows: FinanceClaim[];
}) {
  const toPay = rows.filter((r) => r.status === "approved");
  const waiting = rows.filter((r) => r.status === "submitted");
  const done = rows.filter(
    (r) => r.status !== "approved" && r.status !== "submitted",
  );
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">To pay</CardTitle>
          <CardDescription>
            The team said yes. Check the receipts, pay the member back by bank
            transfer, then mark it paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {toPay.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to pay.</p>
          ) : (
            <ul aria-label="Claims to pay" className="divide-y divide-border">
              {toPay.map((row) => (
                <PayItem key={row.id} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Waiting for the team</CardTitle>
          <CardDescription>
            A lead of the team, or a captain, says yes first.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {waiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul
              aria-label="Claims waiting for the team"
              className="divide-y divide-border"
            >
              {waiting.map((row) => (
                <li key={row.id} className="py-3">
                  <ClaimSummary row={row} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Done in {yearLabel}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {done.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul aria-label="Claims done" className="divide-y divide-border">
              {done.map((row) => (
                <li key={row.id} className="py-3">
                  <ClaimSummary row={row} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClaimSummary({ row }: { row: FinanceClaim }) {
  const badge = CLAIM_BADGE[row.status];
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">
          {formatMoney(row.amountCents)}
        </span>
        <span className="text-sm">{row.submitterName}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </span>
      <span className="text-sm">{row.description}</span>
      <span className="text-xs text-muted-foreground">
        {[
          row.teamLabel,
          row.spentOn ? `bought ${formatDay(row.spentOn)}` : null,
          row.approverName && row.status !== "submitted"
            ? `${row.status === "rejected" ? "decided" : "approved"} by ${row.approverName}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {row.status === "rejected" && row.decisionNote && (
        <span className="text-xs text-muted-foreground">
          Why: {row.decisionNote}
        </span>
      )}
      {row.files.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {row.files.map((id, i) => (
            <a
              key={id}
              href={claimReceiptPath(id)}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Receipt {i + 1}
            </a>
          ))}
        </span>
      )}
    </span>
  );
}

function PayItem({ row }: { row: FinanceClaim }) {
  const router = useRouter();
  const [paying, startPay] = useTransition();
  const [reading, startRead] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [account, setAccount] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = paying || rejecting;

  function pay() {
    startPay(async () => {
      const res = await payClaimAction({ claimId: row.id, decision: "paid" });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Marked paid: ${formatMoney(row.amountCents)} to ${row.submitterName}.`,
      );
      router.refresh();
    });
  }

  function readAccount() {
    startRead(async () => {
      const res = await readClaimAccountAction({ claimId: row.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAccount(res.data.details);
    });
  }

  function reject() {
    setError(null);
    startReject(async () => {
      const res = await payClaimAction({
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
    <li className="flex flex-col gap-3 py-3">
      <ClaimSummary row={row} />
      {account !== null && (
        <p
          className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm"
          aria-label={`${row.submitterName}'s bank details`}
        >
          {account}
        </p>
      )}
      {row.own ? (
        <span className="text-xs text-muted-foreground">
          Your own claim: someone else in the Finance team pays it.
        </span>
      ) : (
        <span className="flex flex-wrap gap-2">
          {account === null && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reading}
              onClick={readAccount}
            >
              {reading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Eye aria-hidden />
              )}
              Show bank details
            </Button>
          )}
          <Button type="button" size="sm" disabled={busy} onClick={pay}>
            {paying ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Banknote aria-hidden />
            )}
            Mark paid
          </Button>
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
        </span>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Turn this claim down?"
        description={`The team said yes, but ${row.submitterName}'s claim for ${formatMoney(row.amountCents)} will not be paid. They see it on their claims, with your reason.`}
        confirmLabel="Turn down"
        destructive
        pending={rejecting}
        error={error}
        onConfirm={reject}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`pay-note-${row.id}`}>Why</Label>
          <Textarea
            id={`pay-note-${row.id}`}
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
