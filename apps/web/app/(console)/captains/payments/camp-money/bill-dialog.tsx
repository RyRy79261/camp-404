"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { parseMoneyToMinor } from "@camp404/core";
import type { CampBillRepeat } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { AckRow } from "@camp404/ui/components/checkbox";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { toast } from "@camp404/ui/components/toast";
import type { BillForEdit } from "@/lib/camp-money-view";
import { typedRands } from "@/lib/dues-view";
import {
  addCampBillAction,
  removeCampBillAction,
  updateCampBillAction,
} from "../camp-money-actions";

// "+ Add a bill" and a bill's pencil (Camp money, mock-up step 1): what the
// bill is for, who it is paid to, how much, when, one time or monthly (and
// for how many months), and whether it is only planned so far. A typing
// problem shows inside the dialog; the server checks it all again.

const TYPE_AMOUNT = "Type the amount in rands, like 4400 or 4400,50.";

export function BillDialog({ bill }: { bill?: BillForEdit }) {
  const router = useRouter();
  const id = useId();
  const [confirm, confirmDialog] = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [repeat, setRepeat] = useState<CampBillRepeat>("once");
  const [months, setMonths] = useState("6");
  const [planned, setPlanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();

  function openDialog() {
    setName(bill?.name ?? "");
    setPayee(bill?.payee ?? "");
    setAmount(bill ? typedRands(bill.amountCents) : "");
    setDueOn(bill?.dueOn ?? "");
    setRepeat(bill?.repeat ?? "once");
    setMonths(bill && bill.repeat === "monthly" ? String(bill.times) : "6");
    setPlanned(bill?.planned ?? false);
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    const cents = parseMoneyToMinor(amount);
    if (cents === null || cents <= 0) {
      setError(TYPE_AMOUNT);
      return;
    }
    if (!dueOn) {
      setError("Pick the day it is due.");
      return;
    }
    const times = repeat === "monthly" ? Number(months) : 1;
    if (!Number.isInteger(times) || times < 1) {
      setError("Type how many months, like 6.");
      return;
    }
    const input = {
      name,
      payee,
      amountCents: cents,
      dueOn,
      repeat,
      times,
      planned,
    };
    start(async () => {
      const res = bill
        ? await updateCampBillAction({
            billId: bill.id,
            expectedVersion: bill.version,
            bill: input,
          })
        : await addCampBillAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(bill ? "Bill saved" : "Bill added");
      setOpen(false);
      router.refresh();
    });
  }

  async function remove() {
    if (!bill) return;
    const sure = await confirm({
      title: `Remove "${bill.name}"?`,
      description:
        "It leaves the list and the forecast. Payments already marked paid stay in the audit log.",
      confirmLabel: "Remove bill",
      destructive: true,
    });
    if (!sure) return;
    startRemove(async () => {
      const res = await removeCampBillAction({
        billId: bill.id,
        expectedVersion: bill.version,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Bill removed");
      setOpen(false);
      router.refresh();
    });
  }

  const busy = pending || removing;

  return (
    <>
      {confirmDialog}
      {bill ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Change ${bill.name}`}
          onClick={openDialog}
        >
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button type="button" onClick={openDialog}>
          <Plus aria-hidden />
          Add a bill
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => (busy ? null : setOpen(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bill ? `Change ${bill.name}` : "Add a bill"}
            </DialogTitle>
            <DialogDescription>
              Something the camp must pay. The forecast counts it until it is
              marked paid.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <InputField
              label="What it is for"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.currentTarget.value)}
              disabled={busy}
            />
            <InputField
              label="Paid to"
              helper="Optional, like Dimensions."
              value={payee}
              maxLength={120}
              onChange={(e) => setPayee(e.currentTarget.value)}
              disabled={busy}
            />
            <div className="grid gap-4 page-sm:grid-cols-2">
              <InputField
                label="Amount (R)"
                inputMode="decimal"
                emoji={false}
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
                disabled={busy}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-due`}>
                  {repeat === "monthly" ? "First due" : "Due"}
                </Label>
                <DateControl
                  id={`${id}-due`}
                  value={dueOn}
                  onChange={(e) => setDueOn(e.currentTarget.value)}
                  disabled={busy}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id={`${id}-repeat`}>How often</Label>
              <SegmentedControl
                aria-label="How often"
                options={[
                  { value: "once", label: "One time" },
                  { value: "monthly", label: "Monthly" },
                ]}
                value={repeat}
                onValueChange={(v) => setRepeat(v as CampBillRepeat)}
                disabled={busy}
              />
            </div>
            {repeat === "monthly" && (
              <InputField
                label="For how many months"
                inputMode="numeric"
                emoji={false}
                value={months}
                onChange={(e) => setMonths(e.currentTarget.value)}
                disabled={busy}
                wrapperClassName="max-w-[12rem]"
              />
            )}
            <AckRow
              checked={planned}
              onCheckedChange={(v) => setPlanned(v === true)}
              disabled={busy}
            >
              Only planned so far
              <span className="block text-xs text-muted-foreground">
                Not agreed yet. The forecast still counts it.
              </span>
            </AckRow>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            {bill ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => void remove()}
              >
                {removing ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 aria-hidden />
                )}
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || !name.trim() || !amount.trim()}
                onClick={save}
              >
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {bill ? "Save bill" : "Add bill"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
