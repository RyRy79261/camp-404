"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, ReceiptText, Send } from "lucide-react";
import { formatMoney, parseMoneyToMinor } from "@camp404/core";
import type { PaymentMethod } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@camp404/ui/components/dialog";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { ReceiptPicker } from "@/components/claims/receipt-picker";
import { PROOF_MAX_BYTES, PROOF_TYPES } from "@/lib/dues-copy";
import { METHOD_CHOICES, typedRands } from "@/lib/dues-view";
import { requestMyRefundAction, savePledgeAction } from "./actions";

// The member's own dues forms (#240): their pledge, their proof of payment,
// and asking for a refund. Problems with what they typed show beside the form.
// Each form's button is normal width at its foot, on the left, like every
// other form in the console. Once a member has pledged, or has nothing left
// to send proof for, the form moves into a dialog behind a quiet button, so
// the page reads like a statement (AfrikaBurn's add-and-edit dialog; on a
// phone the dialog fills the screen).

const TYPE_AMOUNT = "Type the amount in rands, like 1250 or 1250,50.";
const BELOW = "below";

/** A dialog that fills a phone's screen and scrolls when it is long. */
const DIALOG_CLASS =
  "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:max-w-full max-sm:rounded-none max-sm:border-0";

const selectClass =
  "h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

export function PledgeForm({
  tiers,
  pledge,
  locked,
  onSaved,
}: {
  tiers: { id: string; label: string; amountCents: number }[];
  pledge: { tierId: string | null; amountCents: number } | null;
  locked: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(pledge ? (pledge.tierId ?? BELOW) : "");
  const [below, setBelow] = useState(
    pledge && pledge.tierId === null ? typedRands(pledge.amountCents) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The Finance team hasn&rsquo;t set this year&rsquo;s fees yet. Check back
        soon.
      </p>
    );
  }
  if (locked) {
    return pledge ? (
      <p className="text-sm">
        You pledged{" "}
        <span className="font-medium tabular-nums">
          {formatMoney(pledge.amountCents)}
        </span>
        .
      </p>
    ) : null;
  }

  function save() {
    setError(null);
    let input: unknown;
    if (choice === BELOW) {
      const cents = parseMoneyToMinor(below);
      if (cents === null || cents <= 0) {
        setError(TYPE_AMOUNT);
        return;
      }
      input = { kind: "below", amountCents: cents };
    } else if (choice) {
      input = { kind: "tier", tierId: choice };
    } else {
      setError("Pick what you can pay.");
      return;
    }
    start(async () => {
      const res = await savePledgeAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(
        res.data.charged
          ? "Saved. Your camp fee is on your dues now."
          : "Saved. Your fee is charged once you have a place.",
      );
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <OptionCardGroup
        aria-label="What you can pay"
        value={choice}
        onValueChange={setChoice}
        options={[
          ...tiers.map((t) => ({
            value: t.id,
            label: `${t.label}: ${formatMoney(t.amountCents)}`,
          })),
          {
            value: BELOW,
            label: "Less than that",
            description: "Say what you can pay.",
          },
        ]}
      />
      {choice === BELOW && (
        <InputField
          label="What you can pay (R)"
          inputMode="decimal"
          className="max-w-48"
          value={below}
          onChange={(e) => setBelow(e.currentTarget.value)}
          disabled={pending}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="self-start"
        disabled={pending || !choice}
        onClick={save}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pledge ? "Change my pledge" : "Save my pledge"}
      </Button>
    </div>
  );
}

/** "Change" beside a pledge that is not charged yet: the form in a dialog. */
export function PledgeDialog({
  tiers,
  pledge,
}: {
  tiers: { id: string; label: string; amountCents: number }[];
  pledge: { tierId: string | null; amountCents: number };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Pencil aria-hidden />
          Change
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle>What you can pay</DialogTitle>
          <DialogDescription>
            You can change it until your fee is charged. Less than the lowest
            tier is fine too.
          </DialogDescription>
        </DialogHeader>
        <PledgeForm
          tiers={tiers}
          pledge={pledge}
          locked={false}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Send another proof" once nothing is left to pay (or "Send a proof" before
 * any payment): the form in a dialog.
 */
export function ProofDialog({
  today,
  label = "Send another proof",
}: {
  today: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <ReceiptText aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle>Tell us you paid</DialogTitle>
          <DialogDescription>
            Send the amount, the day and your proof of payment: a photo or a PDF
            of the bank&rsquo;s confirmation. Never send card numbers.
          </DialogDescription>
        </DialogHeader>
        <ProofForm today={today} onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function ProofForm({
  today,
  onSent,
}: {
  today: string;
  onSent?: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    const cents = parseMoneyToMinor(amount);
    if (cents === null || cents <= 0) {
      setError(TYPE_AMOUNT);
      return;
    }
    if (!paidOn) {
      setError("Pick the day you paid.");
      return;
    }
    if (!file) {
      setError("Add your proof of payment: a photo or a PDF.");
      return;
    }
    if (file.size > PROOF_MAX_BYTES) {
      setError("That file is over 4 MB. Send a smaller photo or PDF.");
      return;
    }
    const form = new FormData();
    form.set("proof", file);
    form.set("amountCents", String(cents));
    form.set("paidOn", paidOn);
    form.set("method", method);
    form.set("note", note);
    start(async () => {
      let res: Response;
      try {
        res = await fetch("/api/uploads/payment-proof", {
          method: "POST",
          body: form,
        });
      } catch {
        setError("That didn't send. Check your connection and try again.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        reference?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "That didn't send. Try again.");
        return;
      }
      toast.success(
        `Sent as ${body.reference}. The Finance team will check it against the bank.`,
      );
      setAmount("");
      setNote("");
      setFile(null);
      onSent?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 page-sm:grid-cols-[12rem_12rem]">
        <InputField
          label="Amount (R)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.currentTarget.value)}
          disabled={pending}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="proof-day">Day you paid</Label>
          <DateControl
            id="proof-day"
            value={paidOn}
            max={today}
            onChange={(e) => setPaidOn(e.currentTarget.value)}
            disabled={pending}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="proof-method">How you paid</Label>
        <select
          id="proof-method"
          className={selectClass}
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          disabled={pending}
        >
          {METHOD_CHOICES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="proof-file">Proof of payment</Label>
        <ReceiptPicker
          id="proof-file"
          files={file ? [file] : []}
          onChange={(files) => setFile(files[0] ?? null)}
          maxFiles={1}
          maxBytes={PROOF_MAX_BYTES}
          accept={Object.keys(PROOF_TYPES).join(",")}
          inputLabel="Proof of payment"
          addText="Add your proof"
          kindText="A PDF or a photo of the bank's confirmation"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Only you and the Finance team can open it.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="proof-note">Note (optional)</Label>
        <Textarea
          id="proof-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          For example: paid for me and my partner.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="self-start"
        disabled={pending}
        onClick={send}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Send aria-hidden />
        )}
        Send it
      </Button>
    </div>
  );
}

export function RefundAsk({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function ask() {
    setError(null);
    start(async () => {
      const res = await requestMyRefundAction({ paymentId, note });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Asked. The Finance team will let you know.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Ask for a refund
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Ask for a refund?"
        description="You said you're not coming this year. How much comes back depends on this year's refund dates; the Finance team decides and pays it back."
        confirmLabel="Ask for a refund"
        pending={pending}
        error={error}
        onConfirm={ask}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`refund-note-${paymentId}`}>Note (optional)</Label>
          <Textarea
            id={`refund-note-${paymentId}`}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            disabled={pending}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
