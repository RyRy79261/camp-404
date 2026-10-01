"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { parseMoneyToMinor } from "@camp404/core";
import {
  CLAIM_ACCOUNT_MAX,
  CLAIM_DESCRIPTION_MAX,
  CLAIM_MAX_FILES,
  type ClaimAccountType,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { DateControl } from "@camp404/ui/components/date-control";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { BANK_DETAILS_AUDIENCE } from "@/lib/claims-copy";
import { ACCOUNT_TYPE_LABELS } from "@/lib/claims-view";
import { PROOF_MAX_BYTES } from "@/lib/dues-copy";
import { formatDay } from "@/lib/dues-view";
import { ReceiptPicker } from "./receipt-picker";

// A member's claim for money they spent for a team (#242): the team, what
// they bought, the amount, the day, one or more receipts and the bank account
// to pay them back into. It goes to /api/uploads/claim in one request, which
// checks the files and refuses a claim with none. A problem with what they
// typed shows under its own field, and the first one is scrolled to and
// focused; a refusal from the server (or no signal) shows above Send.

const TYPE_AMOUNT = "Type the amount in rands, like 450 or 450,50.";

type Field =
  | "team"
  | "description"
  | "amount"
  | "spentOn"
  | "receipts"
  | "account";
type Errors = Partial<Record<Field, string>>;

const FIELD_ORDER: readonly Field[] = [
  "team",
  "description",
  "amount",
  "spentOn",
  "receipts",
  "account",
];

const ID: Record<Field, string> = {
  team: "claim-team",
  description: "claim-what",
  amount: "claim-amount",
  spentOn: "claim-day",
  receipts: "claim-receipts",
  account: "claim-account",
};

/** Every problem with the claim as typed, by field. Pure. */
export function claimProblems(input: {
  team: string;
  description: string;
  amount: string;
  spentOn: string;
  files: readonly File[];
  account: string;
}): Errors {
  const errors: Errors = {};
  if (!input.team) errors.team = "Pick the team it was for.";
  if (!input.description.trim()) errors.description = "Say what you bought.";
  const cents = parseMoneyToMinor(input.amount);
  if (cents === null || cents <= 0) errors.amount = TYPE_AMOUNT;
  if (!input.spentOn) errors.spentOn = "Pick the day you bought it.";
  if (input.files.length === 0) {
    errors.receipts = "Add at least one receipt: a photo or a PDF.";
  } else if (input.files.length > CLAIM_MAX_FILES) {
    errors.receipts = `Add at most ${CLAIM_MAX_FILES} files to one claim.`;
  } else if (
    input.files.reduce((sum, f) => sum + f.size, 0) > PROOF_MAX_BYTES
  ) {
    errors.receipts =
      "The receipts come to over 4 MB. Send smaller photos or PDFs.";
  }
  if (!input.account.trim()) {
    errors.account = "Add the bank account to pay you back into.";
  }
  return errors;
}

export function ClaimForm({
  teams,
  defaultTeam,
  today,
  onSent,
  onPendingChange,
}: {
  teams: { key: string; label: string }[];
  defaultTeam: string | null;
  today: string;
  /** After a claim is sent (the dialog closes). */
  onSent?: () => void;
  /** While a send is on its way (the dialog will not close mid-send). */
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [team, setTeam] = useState(defaultTeam ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(today);
  const [files, setFiles] = useState<File[]>([]);
  const [accountType, setAccountType] = useState<ClaimAccountType>("sa");
  const [account, setAccount] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  /** Clear a field's error as soon as the member changes it. */
  function touched(field: Field) {
    if (!errors[field]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function send() {
    setRefusal(null);
    const problems = claimProblems({
      team,
      description,
      amount,
      spentOn,
      files,
      account,
    });
    setErrors(problems);
    const first = FIELD_ORDER.find((f) => problems[f]);
    if (first) {
      const el = formRef.current?.querySelector<HTMLElement>(`#${ID[first]}`);
      el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return;
    }
    const form = new FormData();
    form.set("team", team);
    form.set("description", description);
    form.set("amountCents", String(parseMoneyToMinor(amount)));
    form.set("spentOn", spentOn);
    form.set("accountType", accountType);
    form.set("accountDetails", account);
    for (const file of files) form.append("receipt", file);
    start(async () => {
      let res: Response;
      try {
        res = await fetch("/api/uploads/claim", { method: "POST", body: form });
      } catch {
        setRefusal("That didn't send. Check your connection and try again.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setRefusal(body.error ?? "That didn't send. Try again.");
        return;
      }
      toast.success("Claim sent. The team's lead will look at it.");
      setDescription("");
      setAmount("");
      setAccount("");
      setFiles([]);
      router.refresh();
      onSent?.();
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <FieldBox id={ID.team} label="Team" error={errors.team}>
        <Select
          value={team}
          onValueChange={(v) => {
            setTeam(v);
            touched("team");
          }}
          disabled={pending}
        >
          <SelectTrigger
            id={ID.team}
            className="w-full"
            aria-invalid={errors.team ? true : undefined}
            aria-describedby={errors.team ? `${ID.team}-error` : undefined}
          >
            <SelectValue placeholder="Pick the team it was for" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldBox>
      <FieldBox
        id={ID.description}
        label="What you bought"
        error={errors.description}
      >
        <Textarea
          id={ID.description}
          rows={2}
          maxLength={CLAIM_DESCRIPTION_MAX}
          value={description}
          onChange={(e) => {
            setDescription(e.currentTarget.value);
            touched("description");
          }}
          disabled={pending}
          placeholder="Two gas bottle refills, for example"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={
            errors.description ? `${ID.description}-error` : undefined
          }
        />
      </FieldBox>
      <div className="grid gap-4 page-sm:grid-cols-2">
        <FieldBox id={ID.amount} label="Amount (R)" error={errors.amount}>
          <Input
            id={ID.amount}
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.currentTarget.value);
              touched("amount");
            }}
            disabled={pending}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? `${ID.amount}-error` : undefined}
          />
        </FieldBox>
        <FieldBox
          id={ID.spentOn}
          label="Day you bought it"
          error={errors.spentOn}
          helper={spentOn ? formatDay(spentOn) : undefined}
        >
          <DateControl
            id={ID.spentOn}
            lang="en-ZA"
            value={spentOn}
            max={today}
            onChange={(e) => {
              setSpentOn(e.currentTarget.value);
              touched("spentOn");
            }}
            disabled={pending}
            aria-invalid={errors.spentOn ? true : undefined}
            aria-describedby={`${ID.spentOn}-${errors.spentOn ? "error" : "helper"}`}
          />
        </FieldBox>
      </div>
      <FieldBox
        id={ID.receipts}
        label="Receipts"
        error={errors.receipts}
        helper="Only you and the Finance team can open them."
      >
        <ReceiptPicker
          id={ID.receipts}
          files={files}
          onChange={(next) => {
            setFiles(next);
            touched("receipts");
          }}
          maxFiles={CLAIM_MAX_FILES}
          maxBytes={PROOF_MAX_BYTES}
          disabled={pending}
          invalid={Boolean(errors.receipts)}
          describedBy={
            errors.receipts ? `${ID.receipts}-error` : `${ID.receipts}-helper`
          }
        />
      </FieldBox>
      <FieldBox id="claim-bank" label="Your bank">
        <Select
          value={accountType}
          onValueChange={(v) => setAccountType(v as ClaimAccountType)}
          disabled={pending}
        >
          <SelectTrigger id="claim-bank" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ACCOUNT_TYPE_LABELS) as ClaimAccountType[]).map(
              (key) => (
                <SelectItem key={key} value={key}>
                  {ACCOUNT_TYPE_LABELS[key]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </FieldBox>
      <FieldBox
        id={ID.account}
        label="Bank details"
        error={errors.account}
        helper={BANK_DETAILS_AUDIENCE}
      >
        <Textarea
          id={ID.account}
          rows={3}
          maxLength={CLAIM_ACCOUNT_MAX}
          value={account}
          onChange={(e) => {
            setAccount(e.currentTarget.value);
            touched("account");
          }}
          disabled={pending}
          placeholder={
            accountType === "sa"
              ? "Account holder, bank, account number and branch code"
              : "Account holder, bank, IBAN or account number, and SWIFT code"
          }
          aria-invalid={errors.account ? true : undefined}
          aria-describedby={`${ID.account}-${errors.account ? "error" : "helper"}`}
        />
      </FieldBox>
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {refusal}
        </p>
      )}
      <Button type="submit" disabled={pending} className="page-sm:self-end">
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Send aria-hidden />
        )}
        Send my claim
      </Button>
    </form>
  );
}

/** A label over its control, then the field's error or its helper line. */
function FieldBox({
  id,
  label,
  error,
  helper,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
