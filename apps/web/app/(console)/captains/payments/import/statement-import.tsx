"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, Loader2 } from "lucide-react";
import {
  formatMoney,
  STATEMENT_MAX_BYTES,
  type StatementProposal,
} from "@camp404/core";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Label } from "@camp404/ui/components/label";
import { toast } from "@camp404/ui/components/toast";
import { ReceiptPicker } from "@/components/claims/receipt-picker";
import { formatDay } from "@/lib/dues-view";
import {
  confirmStatementLineAction,
  previewStatementAction,
  type StatementPreview,
} from "../dues-actions";

// The statement import's island (#240). The file goes to the server once, is
// read there and thrown away; what comes back is the lines of money coming
// in, each with the member its reference names. The Finance team confirms one
// line at a time (a one-tap row action: a failure is a toast, only that
// button spins). A line with no reference can be given a member by hand, and
// one whose amount matches a single payment waiting to be checked comes with
// that member suggested. Every line is one grid of fixed columns (amount and
// day, what the bank says with one chip, the member, "Record"), so the picker
// and the button sit in the same place on every row, whatever the chip says.

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface Line extends StatementProposal {
  /** The member the Finance team picked, or the one the reference names. */
  pickedId: string;
  done: string | null;
}

export function StatementImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startRead] = useTransition();
  const [preview, setPreview] = useState<
    (Omit<StatementPreview, "proposals"> & { lines: Line[] }) | null
  >(null);
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [confirming, startConfirm] = useTransition();

  function read() {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set("statement", file);
    startRead(async () => {
      const res = await previewStatementAction(form);
      if (!res.ok) {
        setError(res.error);
        setPreview(null);
        return;
      }
      const { proposals, ...rest } = res.data;
      setPreview({
        ...rest,
        lines: proposals.map((p) => ({
          ...p,
          pickedId: p.member?.id ?? "",
          done: p.alreadyRecorded ? "Already on the ledger" : null,
        })),
      });
    });
  }

  function confirm(line: Line) {
    setBusyRow(line.row);
    startConfirm(async () => {
      const res =
        line.pendingPaymentId && line.pickedId === line.member?.id
          ? await confirmStatementLineAction({
              kind: "reconcile",
              paymentId: line.pendingPaymentId,
            })
          : await confirmStatementLineAction({
              kind: "record",
              userId: line.pickedId,
              amountCents: line.amountCents,
              paidOn: line.date,
              description: line.description,
            });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const reference = res.data.reference;
      setPreview((current) =>
        current
          ? {
              ...current,
              lines: current.lines.map((l) =>
                l.row === line.row
                  ? {
                      ...l,
                      done: reference
                        ? `Recorded as ${reference}`
                        : "Marked received",
                    }
                  : l,
              ),
            }
          : current,
      );
      router.refresh();
    });
  }

  const matched =
    preview?.lines.filter((l) => l.matchedBy === "reference").length ?? 0;
  const summary = preview
    ? [
        preview.lines.length === 0
          ? "No money coming in on this statement."
          : `${preview.lines.length} ${preview.lines.length === 1 ? "payment" : "payments"} in, ${matched} matched by reference.`,
        preview.skippedOutgoing > 0
          ? `${preview.skippedOutgoing} ${preview.skippedOutgoing === 1 ? "payment out was" : "payments out were"} skipped.`
          : null,
        preview.skippedUnreadable > 0
          ? `${preview.skippedUnreadable} ${preview.skippedUnreadable === 1 ? "line" : "lines"} could not be read.`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">Read a statement</CardTitle>
          <CardDescription>
            A CSV file downloaded from the bank or the transfer service. It is
            read once and not kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-0">
          <div className="flex max-w-xl flex-col gap-1.5">
            <Label htmlFor="statement-file">Statement file</Label>
            <ReceiptPicker
              id="statement-file"
              files={file ? [file] : []}
              onChange={(files) => {
                setFile(files[0] ?? null);
                setError(null);
              }}
              maxFiles={1}
              maxBytes={STATEMENT_MAX_BYTES}
              accept=".csv,text/csv,text/plain"
              inputLabel="Statement file"
              addText="Add the statement"
              kindText="A CSV file"
              disabled={reading}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            className="self-start"
            disabled={!file || reading}
            onClick={read}
          >
            {reading ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <FileUp aria-hidden />
            )}
            Read the statement
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <section
          aria-labelledby="statement-lines"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="statement-lines"
              className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground"
            >
              Money coming in
            </h2>
            <p role="status" className="text-sm text-muted-foreground">
              {summary}
            </p>
          </div>
          {preview.lines.length > 0 && (
            <ul
              aria-label="Statement payments"
              className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
            >
              {preview.lines.map((line) => {
                const closesProof =
                  !line.done &&
                  line.pendingPaymentId !== null &&
                  line.pickedId === line.member?.id;
                const chip = line.done
                  ? null
                  : closesProof
                    ? line.matchedBy === "amount"
                      ? `Same amount as ${line.member!.name}'s pending payment`
                      : `Marks ${line.member!.name}'s pending payment received`
                    : !line.member
                      ? "No reference found"
                      : null;
                return (
                  <li
                    key={line.row}
                    className="grid gap-3 p-4 page-md:grid-cols-[8rem_minmax(0,1fr)_14rem_7rem] page-md:items-start"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium tabular-nums">
                        {formatMoney(line.amountCents)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDay(line.date)}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      <span
                        className="w-full truncate text-sm"
                        title={line.description || undefined}
                      >
                        {line.description || "No description"}
                      </span>
                      {line.done ? (
                        <Badge variant="success">
                          <Check className="h-3 w-3" aria-hidden />
                          {line.done}
                        </Badge>
                      ) : chip ? (
                        <Badge
                          variant="outline"
                          className="max-w-full whitespace-normal text-left"
                        >
                          {chip}
                        </Badge>
                      ) : null}
                    </span>
                    <select
                      aria-label={`Member for the payment on ${formatDay(line.date)}`}
                      className={selectClass}
                      value={line.pickedId}
                      disabled={Boolean(line.done) || confirming}
                      onChange={(e) => {
                        const pickedId = e.target.value;
                        setPreview((current) =>
                          current
                            ? {
                                ...current,
                                lines: current.lines.map((l) =>
                                  l.row === line.row ? { ...l, pickedId } : l,
                                ),
                              }
                            : current,
                        );
                      }}
                    >
                      <option value="">Pick a member</option>
                      {preview.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.refCode})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={
                        Boolean(line.done) || !line.pickedId || confirming
                      }
                      onClick={() => confirm(line)}
                    >
                      {confirming && busyRow === line.row && (
                        <Loader2 className="animate-spin" aria-hidden />
                      )}
                      Record
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
