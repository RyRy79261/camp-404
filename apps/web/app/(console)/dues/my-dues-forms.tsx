"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { formatMoney, parseMoneyToMinor } from "@camp404/core";
import type { PaymentMethod } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { ConfirmDialog } from "@camp404/ui/components/confirm-dialog";
import { DateControl } from "@camp404/ui/components/date-control";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { OptionCardGroup } from "@camp404/ui/components/option-card-group";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { PROOF_MAX_BYTES } from "@/lib/dues-copy";
import { METHOD_CHOICES, typedRands } from "@/lib/dues-view";
import { requestMyRefundAction, savePledgeAction } from "./actions";

// The member's own dues forms (#240): their pledge, their proof of payment,
// and asking for a refund. Problems with what they typed show beside the form.

const TYPE_AMOUNT = "Type the amount in rands, like 1250 or 1250,50.";
const BELOW = "below";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

export function PledgeForm({
  tiers,
  pledge,
  locked,
}: {
  tiers: { id: string; label: string; amountCents: number }[];
  pledge: { tierId: string | null; amountCents: number } | null;
  locked: boolean;
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
      <Button type="button" disabled={pending || !choice} onClick={save}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pledge ? "Change my pledge" : "Save my pledge"}
      </Button>
    </div>
  );
}

export function ProofForm({ today }: { today: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
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
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
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
        <input
          ref={fileRef}
          id="proof-file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          A PDF or a photo, up to 4 MB. Only you and the Finance team can open
          it.
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
          placeholder="Paid for me and my partner, for example"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" disabled={pending} onClick={send}>
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
