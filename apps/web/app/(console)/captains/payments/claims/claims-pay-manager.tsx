"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Copy, Eye, FileText, Loader2, X } from "lucide-react";
import { formatMoney, sumMinor } from "@camp404/core";
import {
  CLAIM_NOTE_MAX,
  type ClaimAccountType,
  type ClaimStatus,
} from "@camp404/types";
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
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import { RowActions } from "@camp404/ui/components/row-actions";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { claimReceiptPath } from "@/lib/claims-copy";
import {
  ACCOUNT_TYPE_LABELS,
  decisionLine,
  receiptLabel,
} from "@/lib/claims-view";
import { formatDay } from "@/lib/dues-view";
import { payClaimAction, readClaimAccountAction } from "../claims-actions";

// The Finance team's claims (#242), in four tables that turn into cards in a
// narrow window: to pay, waiting for the team, paid, and turned down. A
// section's title says where its claims are, so a row wears no badge that
// repeats it. On a row to pay, "Mark paid" is the one main button and "Turn
// down" sits beside it, in the same place on every row; the bank details open
// in their own "Pay into" column (each read is recorded), so nothing moves
// when they do. "Mark paid" and "Show" are one-tap changes on a list row: a
// failure is a toast, and only that control spins. "Turn down" asks for a
// reason in a dialog, where a problem with what was typed shows.

export interface FinanceClaim {
  id: string;
  teamLabel: string;
  submitterName: string;
  description: string;
  amountCents: number;
  spentOn: string | null;
  status: ClaimStatus;
  accountType: ClaimAccountType;
  decisionNote: string | null;
  approverName: string | null;
  /** When the team said yes, or null if it never did. */
  approvedAt: Date | null;
  /** The receipt files, in the member's order. */
  files: { id: string; contentType: string }[];
  /** The viewer's own claim: someone else in Finance pays it. */
  own: boolean;
}

function countAndTotal(rows: FinanceClaim[]): string {
  const claims = rows.length === 1 ? "1 claim" : `${rows.length} claims`;
  return `${claims} · ${formatMoney(sumMinor(rows.map((r) => r.amountCents)))}`;
}

const WHO: ResponsiveColumn<FinanceClaim> = {
  id: "who",
  header: "Who",
  role: "title",
  cellClassName: "font-medium",
  cell: (r) => r.submitterName,
};

/** What it was for, then the team, the day and who decided. */
function whatFor(withDecision: boolean): ResponsiveColumn<FinanceClaim> {
  return {
    id: "what",
    header: "What for",
    cell: (r) => (
      <span className="flex flex-col gap-0.5">
        <span>{r.description}</span>
        <span className="text-xs text-muted-foreground">
          {[
            r.teamLabel,
            r.spentOn ? `bought ${formatDay(r.spentOn)}` : null,
            withDecision ? decisionLine(r) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    ),
  };
}

const RECEIPTS: ResponsiveColumn<FinanceClaim> = {
  id: "receipts",
  header: "Receipts",
  cell: (r) =>
    r.files.length === 0 ? (
      "—"
    ) : (
      <span className="flex flex-col gap-1">
        {r.files.map((f, i) => (
          <a
            key={f.id}
            href={claimReceiptPath(f.id)}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-accent hover:underline"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {receiptLabel(i, f.contentType)}
          </a>
        ))}
      </span>
    ),
};

const AMOUNT: ResponsiveColumn<FinanceClaim> = {
  id: "amount",
  header: "Amount",
  align: "right",
  cellClassName: "whitespace-nowrap font-medium tabular-nums",
  cell: (r) => formatMoney(r.amountCents),
};

const TO_PAY: ResponsiveColumn<FinanceClaim>[] = [
  WHO,
  whatFor(true),
  RECEIPTS,
  {
    id: "pay-into",
    header: "Pay into",
    cell: (r) => <PayInto row={r} />,
  },
  AMOUNT,
  {
    id: "actions",
    header: "Actions",
    role: "actions",
    hideHeader: true,
    align: "right",
    cell: (r) => <PayActions row={r} />,
  },
];

const WAITING: ResponsiveColumn<FinanceClaim>[] = [
  WHO,
  whatFor(false),
  RECEIPTS,
  AMOUNT,
];

const PAID: ResponsiveColumn<FinanceClaim>[] = [
  WHO,
  whatFor(true),
  RECEIPTS,
  AMOUNT,
  {
    id: "status",
    header: "Bank",
    role: "badge",
    hideHeader: true,
    cell: (r) =>
      r.status === "reconciled" ? (
        <Badge variant="success">Matched to the bank</Badge>
      ) : null,
  },
];

const TURNED_DOWN: ResponsiveColumn<FinanceClaim>[] = [
  WHO,
  whatFor(true),
  {
    id: "why",
    header: "Why",
    cellClassName: "text-muted-foreground",
    cell: (r) => r.decisionNote ?? "No reason given",
  },
  RECEIPTS,
  AMOUNT,
];

function Section({
  title,
  description,
  empty,
  rows,
  columns,
  label,
  stackBelow = "md",
}: {
  title: string;
  description?: string;
  empty: string;
  rows: FinanceClaim[];
  columns: ResponsiveColumn<FinanceClaim>[];
  label: string;
  /** To pay has more columns and two buttons, so it stacks sooner. */
  stackBelow?: "md" | "lg";
}) {
  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {rows.length > 0 && (
          <CardDescription className="tabular-nums">
            {countAndTotal(rows)}
          </CardDescription>
        )}
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ResponsiveDataTable
            columns={columns}
            data={rows}
            getRowKey={(r) => r.id}
            label={label}
            pairLayout="stacked"
            stackBelow={stackBelow}
          />
        )}
      </CardContent>
    </Card>
  );
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
  const paid = rows.filter(
    (r) => r.status === "paid" || r.status === "reconciled",
  );
  const turnedDown = rows.filter((r) => r.status === "rejected");
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="To pay"
        description="The team said yes. Check the receipts, pay the member back by bank transfer, then mark it paid."
        empty="Nothing to pay."
        rows={toPay}
        columns={TO_PAY}
        label="Claims to pay"
        stackBelow="lg"
      />
      <Section
        title="Waiting for the team"
        description="A lead of the team, or a captain, says yes first."
        empty="Nothing waiting."
        rows={waiting}
        columns={WAITING}
        label="Claims waiting for the team"
      />
      <Section
        title={`Paid in ${yearLabel}`}
        empty="Nothing paid yet."
        rows={paid}
        columns={PAID}
        label="Claims paid"
      />
      <Section
        title={`Turned down in ${yearLabel}`}
        empty="Nothing turned down."
        rows={turnedDown}
        columns={TURNED_DOWN}
        label="Claims turned down"
      />
    </div>
  );
}

/**
 * Where to pay the member back: on request (each read is recorded), then the
 * account type and the details as typed, with a Copy button. It opens in its
 * own column, so the row's buttons never move.
 */
function PayInto({ row }: { row: FinanceClaim }) {
  const [reading, startRead] = useTransition();
  const [account, setAccount] = useState<string | null>(null);

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

  async function copy() {
    if (account === null) return;
    try {
      await navigator.clipboard.writeText(account);
      toast.success("Bank details copied.");
    } catch {
      toast.error("That didn't copy. Select the text and copy it instead.");
    }
  }

  const type = ACCOUNT_TYPE_LABELS[row.accountType];
  if (account === null) {
    return (
      <span className="flex flex-col items-start gap-1">
        <span className="text-xs text-muted-foreground">{type}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={reading}
          onClick={readAccount}
          aria-label={`Show ${row.submitterName}'s bank details`}
        >
          {reading ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Eye aria-hidden />
          )}
          Show
        </Button>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="text-xs text-muted-foreground">{type}</span>
      <span className="flex items-start gap-1">
        <span
          className="whitespace-pre-wrap text-sm"
          aria-label={`${row.submitterName}'s bank details`}
        >
          {account}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={copy}
          aria-label={`Copy ${row.submitterName}'s bank details`}
          title="Copy"
        >
          <Copy aria-hidden />
        </Button>
      </span>
    </span>
  );
}

function PayActions({ row }: { row: FinanceClaim }) {
  const router = useRouter();
  const [paying, startPay] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = paying || rejecting;

  if (row.own) {
    return (
      <RowActions
        label={`Actions for ${row.submitterName}'s claim`}
        primary={
          <Badge
            variant="outline"
            title="Someone else in the Finance team pays your own claim."
          >
            Your own claim
          </Badge>
        }
      />
    );
  }

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
    <>
      <RowActions
        label={`Actions for ${row.submitterName}'s claim`}
        primary={
          <Button type="button" size="sm" disabled={busy} onClick={pay}>
            {paying ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Banknote aria-hidden />
            )}
            Mark paid
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
    </>
  );
}
